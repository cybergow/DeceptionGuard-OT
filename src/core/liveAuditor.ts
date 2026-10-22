import {
  AuditMode,
  AuditRunResult,
  CaseComparison,
  EgressEventRecord,
  EvaluationMetrics,
  MitigationComparison,
  MitigationConfig,
  ProtectedRegistry,
  SequenceExecutionRecord,
  SimulatorRequest,
  SimulatorResponse,
  TestSequence,
} from './types';
import { TargetConnectionConfig, validateLabTargetSubnet } from './targetTypes';
import { AUDIT_MODE_LABELS, auditSequenceExecution } from './auditor';
import { CORE_TEST_SEQUENCES, generateExtraHarmlessSequences } from './sequences';
import { BASELINE_MITIGATION_CONFIG } from './registry';

function buildRequestHeaders(config: TargetConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (config.authType === 'bearer' && config.authToken.trim()) {
    headers.Authorization = `Bearer ${config.authToken.trim()}`;
  } else if (config.authType === 'api_key' && config.authToken.trim()) {
    headers['X-OT-API-Key'] = config.authToken.trim();
  }
  const headerName = (config.customHeaderName || '').trim();
  const headerVal = (config.customHeaderValue || '').trim();
  if (headerName && headerVal) {
    headers[headerName] = headerVal;
  }
  return headers;
}

export async function executeRemoteStep(
  req: SimulatorRequest,
  config: TargetConnectionConfig,
  registry: ProtectedRegistry,
  mitigation: MitigationConfig,
  onNetworkLog?: (line: string) => void
): Promise<SimulatorResponse> {
  const cleanBase = config.baseUrl.replace(/\/+$/, '');
  const urlObj = new URL(`${cleanBase}${req.endpoint}`);

  if (req.method === 'GET' && req.params) {
    for (const [k, v] of Object.entries(req.params)) {
      urlObj.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 3000);
  const t0 = performance.now();

  try {
    const resp = await fetch(urlObj.toString(), {
      method: req.method,
      headers: buildRequestHeaders(config),
      body: req.method === 'POST' ? JSON.stringify(req.params ?? {}) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Math.max(1, Math.round(performance.now() - t0));
    const rawText = await resp.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { raw_response: rawText };
    }

    let egressAttempt: SimulatorResponse['egressAttempt'] | undefined;
    if (payload._egressAttempt && typeof payload._egressAttempt === 'object') {
      const eg = payload._egressAttempt as {
        destination: string;
        port: number;
        protocol: string;
        blockedByContainment: boolean;
      };
      egressAttempt = eg;
      delete payload._egressAttempt;
    } else if (req.endpoint === '/ot/egress-check') {
      const targetHost = String(req.params?.target_host ?? '127.0.0.1');
      const targetPort = Number(req.params?.target_port ?? 502);
      const protocol = String(req.params?.protocol ?? 'MODBUS');
      const matchedRule = registry.allowlistRules.find(
        (r) => r.cidrOrHost === targetHost && r.port === targetPort
      );
      const isAllowlisted = matchedRule ? matchedRule.allowed : false;
      const blocked =
        payload.status === 'CONTAINMENT_BLOCKED' ||
        payload.blocked === true ||
        (!isAllowlisted && mitigation.enforceStrictEgressAllowlist);
      egressAttempt = {
        destination: targetHost,
        port: targetPort,
        protocol,
        blockedByContainment: blocked,
      };
    }

    onNetworkLog?.(
      `[NET-PROXY] ${req.method} ${urlObj.pathname}${urlObj.search} -> HTTP ${resp.status} (${latencyMs}ms)`
    );

    return {
      stepNumber: req.stepNumber,
      statusCode: resp.status,
      endpoint: req.endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: resp.status >= 200 && resp.status < 500 || req.endpoint === '/ot/error-probe',
      egressAttempt,
    };
  } catch (err) {
    clearTimeout(timeout);
    const latencyMs = Math.max(1, Math.round(performance.now() - t0));
    const message = err instanceof Error ? err.message : String(err);
    onNetworkLog?.(
      `[NET-PROXY-ERR] ${req.method} ${urlObj.toString()} -> FAILED (${message})`
    );
    const errorPayload = { error: 'TARGET_CONNECTION_FAILED', message, endpoint: req.endpoint };
    return {
      stepNumber: req.stepNumber,
      statusCode: 502,
      endpoint: req.endpoint,
      latencyMs,
      payload: errorPayload,
      rawText: JSON.stringify(errorPayload),
      validNormalInteraction: false,
    };
  }
}

export async function runLiveNetworkAuditSuite(
  config: TargetConnectionConfig,
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig,
  mode: AuditMode = 'full_sequence',
  extraHarmlessCount = 0,
  baselineLeakageCountForEffectiveness = 10,
  onNetworkLog?: (line: string) => void
): Promise<AuditRunResult> {
  const validation = validateLabTargetSubnet(config.baseUrl, config.enforcePrivateLabSubnet);
  if (!validation.validUrl || !validation.subnetAllowed) {
    throw new Error(validation.rationale);
  }

  const timestamp = new Date().toISOString();
  const sequences: TestSequence[] = [
    ...CORE_TEST_SEQUENCES,
    ...(extraHarmlessCount > 0 ? generateExtraHarmlessSequences(extraHarmlessCount) : []),
  ];

  const records: SequenceExecutionRecord[] = [];
  const allFindings = [];
  const allContainmentEvents: EgressEventRecord[] = [];

  let totalLatencyMs = 0;
  let totalStepsCount = 0;
  let validNormalSteps = 0;

  const cleanBase = config.baseUrl.replace(/\/+$/, '');

  for (const seq of sequences) {
    // Reset target daemon session state & push active mitigation profile before each sequence
    try {
      await fetch(`${cleanBase}/ot/admin/reset-session`, {
        method: 'POST',
        headers: buildRequestHeaders(config),
        body: JSON.stringify({ mitigation: mitigationConfig }),
      });
    } catch {
      // Custom external servers that don't implement /ot/admin/reset-session ignore this gracefully
    }

    const responses: SimulatorResponse[] = [];
    let seqTimeMs = 0;

    for (const step of seq.steps) {
      const resp = await executeRemoteStep(
        step,
        config,
        registry,
        mitigationConfig,
        onNetworkLog
      );
      responses.push(resp);
      seqTimeMs += resp.latencyMs;
      totalLatencyMs += resp.latencyMs;
      totalStepsCount += 1;
      if (resp.validNormalInteraction) {
        validNormalSteps += 1;
      }
    }

    const { findings, containmentEvents } = auditSequenceExecution(
      seq,
      responses,
      registry,
      mode,
      timestamp
    );

    allFindings.push(...findings);
    allContainmentEvents.push(...containmentEvents);

    const detectedLeakage = findings.length > 0;
    const isLeakageCase = seq.category === 'leakage';

    records.push({
      testCase: seq,
      responses,
      findings,
      detectedLeakage,
      isTruePositive: isLeakageCase && detectedLeakage,
      isFalsePositive: !isLeakageCase && detectedLeakage,
      isFalseNegative: isLeakageCase && !detectedLeakage,
      isTrueNegative: !isLeakageCase && !detectedLeakage,
      normalInteractionsValid: responses.every((r) => r.validNormalInteraction),
      executionTimeMs: seqTimeMs,
    });
  }

  const seededLeakageCases = sequences.filter((s) => s.category === 'leakage').length;
  const harmlessCases = sequences.filter((s) => s.category === 'harmless').length;
  const truePositiveCount = records.filter((r) => r.isTruePositive).length;
  const falsePositiveCount = records.filter((r) => r.isFalsePositive).length;
  const falseNegativeCount = records.filter((r) => r.isFalseNegative).length;
  const trueNegativeCount = records.filter((r) => r.isTrueNegative).length;

  const multiStepRelCases = records.filter(
    (r) => r.testCase.leakageType === 'MULTI_STEP_INFERENCE'
  );
  const recoveredRelCases = multiStepRelCases.filter((r) =>
    r.findings.some((f) => f.category === 'MULTI_STEP_INFERENCE')
  );

  const activeLeakageCases = truePositiveCount;
  const totalCasesFlagged = truePositiveCount + falsePositiveCount;

  const leakageRecallPct =
    seededLeakageCases > 0 ? Number(((truePositiveCount / seededLeakageCases) * 100).toFixed(1)) : 0;
  const precisionPct =
    totalCasesFlagged > 0
      ? Number(((truePositiveCount / totalCasesFlagged) * 100).toFixed(1))
      : 100.0;
  const falsePositiveRatePct =
    harmlessCases > 0 ? Number(((falsePositiveCount / harmlessCases) * 100).toFixed(1)) : 0;
  const inferenceSuccessRatePct =
    multiStepRelCases.length > 0
      ? Number(((recoveredRelCases.length / multiStepRelCases.length) * 100).toFixed(1))
      : 0;

  const reductionCount = Math.max(0, baselineLeakageCountForEffectiveness - activeLeakageCases);
  const mitigationEffectivenessPct =
    baselineLeakageCountForEffectiveness > 0
      ? Number(((reductionCount / baselineLeakageCountForEffectiveness) * 100).toFixed(1))
      : 0;

  const normalInteractionSuccessPct =
    totalStepsCount > 0 ? Number(((validNormalSteps / totalStepsCount) * 100).toFixed(1)) : 100.0;

  const metrics: EvaluationMetrics = {
    totalTestCases: sequences.length,
    seededLeakageCases,
    harmlessCases,
    detectedLeakageCases: activeLeakageCases,
    totalFindingsRaised: allFindings.length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    trueNegativeCount,
    leakageRecallPct,
    precisionPct,
    falsePositiveRatePct,
    inferenceSuccessRatePct,
    mitigationEffectivenessPct,
    normalInteractionSuccessPct,
    runtimeOverheadMs: totalLatencyMs,
    avgStepLatencyMs:
      totalStepsCount > 0 ? Number((totalLatencyMs / totalStepsCount).toFixed(2)) : 0,
  };

  return {
    runId: `LIVE-${config.mode === 'local_process_bridge' ? 'PROC' : 'HTTP'}-${Date.now()
      .toString(36)
      .toUpperCase()}`,
    timestamp,
    mode,
    modeLabel: `${AUDIT_MODE_LABELS[mode]} [Live Target: ${config.baseUrl}]`,
    mitigationConfig: { ...mitigationConfig },
    metrics,
    records,
    findings: allFindings,
    containmentEvents: allContainmentEvents,
  };
}

export async function compareLiveNetworkMitigationRuns(
  config: TargetConnectionConfig,
  registry: ProtectedRegistry,
  mitigatedConfig: MitigationConfig,
  onNetworkLog?: (line: string) => void
): Promise<MitigationComparison> {
  const baselineRun = await runLiveNetworkAuditSuite(
    config,
    registry,
    BASELINE_MITIGATION_CONFIG,
    'full_sequence',
    0,
    10,
    onNetworkLog
  );
  const mitigatedRun = await runLiveNetworkAuditSuite(
    config,
    registry,
    mitigatedConfig,
    'full_sequence',
    0,
    baselineRun.metrics.detectedLeakageCases,
    onNetworkLog
  );

  const caseComparisons: CaseComparison[] = baselineRun.records.map((baseRec, idx) => {
    const mitRec = mitigatedRun.records[idx];
    const isLeakage = baseRec.testCase.category === 'leakage';

    let status: CaseComparison['status'] = 'CLEAN_HARMLESS';
    if (isLeakage) {
      status = mitRec.detectedLeakage ? 'PERSISTING_LEAK' : 'RESOLVED';
    } else {
      status = mitRec.detectedLeakage ? 'REGRESSION_FALSE_ALARM' : 'CLEAN_HARMLESS';
    }

    return {
      testCaseId: baseRec.testCase.id,
      title: baseRec.testCase.title,
      category: baseRec.testCase.category,
      leakageType: baseRec.testCase.leakageType,
      baselineLeaked: baseRec.detectedLeakage,
      postMitigationLeaked: mitRec.detectedLeakage,
      baselineNormalValid: baseRec.normalInteractionsValid,
      postMitigationNormalValid: mitRec.normalInteractionsValid,
      status,
    };
  });

  const leakageReductionCount =
    baselineRun.metrics.detectedLeakageCases - mitigatedRun.metrics.detectedLeakageCases;

  return {
    baselineRun,
    mitigatedRun,
    leakageReductionCount,
    mitigationEffectivenessPct: mitigatedRun.metrics.mitigationEffectivenessPct,
    realismPreservedPct: mitigatedRun.metrics.normalInteractionSuccessPct,
    caseComparisons,
  };
}
