import {
  AblationStudyRow,
  AuditFinding,
  AuditMode,
  AuditRunResult,
  CaseComparison,
  EgressEventRecord,
  EvaluationMetrics,
  MitigationComparison,
  MitigationConfig,
  ProtectedRegistry,
  SequenceExecutionRecord,
  SimulatorResponse,
  TestSequence,
} from './types';
import { BASELINE_MITIGATION_CONFIG, FULL_MITIGATION_CONFIG } from './registry';
import { CORE_TEST_SEQUENCES, generateExtraHarmlessSequences } from './sequences';
import { createInitialSessionState, simulateStep } from './simulator';

export const AUDIT_MODE_LABELS: Record<AuditMode, string> = {
  manual_spot: 'Approach A: Manual Spot Checks (Baseline)',
  single_response: 'Approach B: Single-Response Rules (Ablation 1)',
  sequence_no_consistency: 'Ablation 2: Sequence Audit (No State Consistency)',
  full_sequence: 'Approach C: DeceptionGuard-OT Sequence Audit (Proposed)',
};

function extractDeviceIdFromEndpoint(endpoint: string, payload: Record<string, unknown>): string | null {
  if (typeof payload.device_id === 'string') return payload.device_id;
  const parts = endpoint.split('/');
  const last = parts[parts.length - 1];
  if (/^(P-101|C-201|V-302|T-404|GW-500|HIST-601)$/.test(last)) {
    return last;
  }
  return null;
}

export function auditSequenceExecution(
  testCase: TestSequence,
  responses: SimulatorResponse[],
  registry: ProtectedRegistry,
  mode: AuditMode,
  timestamp: string
): { findings: AuditFinding[]; containmentEvents: EgressEventRecord[] } {
  const findings: AuditFinding[] = [];
  const containmentEvents: EgressEventRecord[] = [];
  let findingCounter = 1;

  // Manual spot checks only inspect the first 3 test cases for top-level canary or template strings
  const manualSpotScope = new Set(['TC-L01', 'TC-L03', 'TC-H01', 'TC-H02']);
  if (mode === 'manual_spot' && !manualSpotScope.has(testCase.id)) {
    return { findings, containmentEvents };
  }

  // 1. Single-step checks: Exact Synthetic Canary Tokens & Prohibited Response Fields
  for (const res of responses) {
    const raw = res.rawText;
    const payloadKeys = Object.keys(res.payload);

    // Check Synthetic Secrets
    for (const secret of registry.syntheticSecrets) {
      if (raw.includes(secret.tokenValue)) {
        findings.push({
          findingId: `${testCase.id}-F${findingCounter++}`,
          testCaseId: testCase.id,
          testCaseTitle: testCase.title,
          timestamp,
          category: 'CANARY_TOKEN',
          severity: secret.severity,
          violatedRuleId: secret.id,
          matchedProtectedFact: `${secret.name} (${secret.tokenValue})`,
          severityRationale: `Response at Step ${res.stepNumber} (${res.endpoint}) exposed seeded synthetic secret "${secret.tokenValue}" in cleartext payload.`,
          inferredAcrossSteps: [res.stepNumber],
          requestSequence: testCase.steps,
          observedResponses: responses,
        });
      }
    }

    // Check Prohibited Fields
    for (const field of registry.prohibitedFields) {
      if (payloadKeys.includes(field.fieldName)) {
        const isErrorFingerprint =
          field.fieldName === 'debug_stack_trace' || res.endpoint === '/ot/error-probe';
        findings.push({
          findingId: `${testCase.id}-F${findingCounter++}`,
          testCaseId: testCase.id,
          testCaseTitle: testCase.title,
          timestamp,
          category: isErrorFingerprint ? 'ERROR_FINGERPRINT' : 'PROHIBITED_FIELD',
          severity: field.severity,
          violatedRuleId: field.id,
          matchedProtectedFact: `Prohibited field "${field.fieldName}": ${String(res.payload[field.fieldName])}`,
          severityRationale: `${field.reason} Observed in Step ${res.stepNumber} (${res.endpoint}).`,
          inferredAcrossSteps: [res.stepNumber],
          requestSequence: testCase.steps,
          observedResponses: responses,
        });
      }
    }

    // Check Egress & Containment Monitor events (Module 6)
    if (res.egressAttempt) {
      const { destination, port, protocol, blockedByContainment } = res.egressAttempt;
      const allowRule = registry.allowlistRules.find(
        (r) => r.cidrOrHost === destination && r.port === port
      );
      const inAllowlist = allowRule ? allowRule.allowed : false;

      containmentEvents.push({
        id: `EGR-${testCase.id}-S${res.stepNumber}`,
        timestamp,
        sourceDevice: 'V-302 / OT-SIM',
        destination,
        port,
        protocol,
        inAllowlist,
        action: inAllowlist ? 'ALLOWED' : blockedByContainment ? 'BLOCKED' : 'ALERT_UNMITIGATED',
        testCaseId: testCase.id,
      });

      if (!inAllowlist && !blockedByContainment && mode !== 'manual_spot') {
        findings.push({
          findingId: `${testCase.id}-F${findingCounter++}`,
          testCaseId: testCase.id,
          testCaseTitle: testCase.title,
          timestamp,
          category: 'CONTAINMENT_BREACH',
          severity: 'CRITICAL',
          violatedRuleId: allowRule?.id ?? 'ALW-DENY-DEFAULT',
          matchedProtectedFact: `Unblocked outbound connection to non-allowlisted destination ${destination}:${port} (${protocol})`,
          severityRationale:
            'Containment policy violation: Simulator dispatched outbound traffic outside the authorized lab allowlist without deny-by-default blocking.',
          inferredAcrossSteps: [res.stepNumber],
          requestSequence: testCase.steps,
          observedResponses: responses,
        });
      }
    }
  }

  // 2. Multi-step Sequence Inference (Enabled only in sequence_no_consistency and full_sequence)
  if (mode === 'sequence_no_consistency' || mode === 'full_sequence') {
    // Map each observed shared join token to the devices & steps that exposed it
    const tokenToSteps = new Map<
      string,
      Array<{ deviceId: string; stepNumber: number; endpoint: string }>
    >();

    for (const res of responses) {
      const deviceId = extractDeviceIdFromEndpoint(res.endpoint, res.payload);
      if (!deviceId) continue;

      const candidateTokens = [
        res.payload.loop_binding_handle,
        res.payload.assigned_loop_token,
        res.payload.bus_channel_ref,
        res.payload.stream_tag,
      ].filter((v): v is string => typeof v === 'string');

      for (const token of candidateTokens) {
        const list = tokenToSteps.get(token) ?? [];
        list.push({ deviceId, stepNumber: res.stepNumber, endpoint: res.endpoint });
        tokenToSteps.set(token, list);
      }
    }

    for (const rel of registry.protectedRelationships) {
      const matches = tokenToSteps.get(rel.sharedJoinKey) ?? [];
      const sourceMatch = matches.find((m) => m.deviceId === rel.sourceDevice);
      const targetMatch = matches.find((m) => m.deviceId === rel.targetDevice);

      if (sourceMatch && targetMatch && sourceMatch.stepNumber !== targetMatch.stepNumber) {
        findings.push({
          findingId: `${testCase.id}-F${findingCounter++}`,
          testCaseId: testCase.id,
          testCaseTitle: testCase.title,
          timestamp,
          category: 'MULTI_STEP_INFERENCE',
          severity: rel.severity,
          violatedRuleId: rel.id,
          matchedProtectedFact: `Protected Relationship ${rel.sourceDevice} <-> ${rel.targetDevice} (${rel.relationshipType}) inferred via join token ${rel.sharedJoinKey}`,
          severityRationale: `Multi-interaction inference: Step ${sourceMatch.stepNumber} (${sourceMatch.endpoint}) exposed token "${rel.sharedJoinKey}" for ${rel.sourceDevice}, and Step ${targetMatch.stepNumber} (${targetMatch.endpoint}) exposed matching token "${rel.sharedJoinKey}" for ${rel.targetDevice}. Neither response revealed the relationship alone.`,
          inferredAcrossSteps: [sourceMatch.stepNumber, targetMatch.stepNumber].sort((a, b) => a - b),
          requestSequence: testCase.steps,
          observedResponses: responses,
        });
      }
    }
  }

  // 3. Multi-step State-Machine Consistency Verification (Enabled only in full_sequence)
  if (mode === 'full_sequence') {
    const transitionedStates = new Map<string, { state: string; stepNumber: number }>();

    for (const res of responses) {
      if (res.endpoint === '/ot/state-transition' && typeof res.payload.device_id === 'string') {
        transitionedStates.set(res.payload.device_id, {
          state: String(res.payload.new_state),
          stepNumber: res.stepNumber,
        });
      }

      if (res.endpoint.startsWith('/ot/telemetry/')) {
        const deviceId = extractDeviceIdFromEndpoint(res.endpoint, res.payload);
        if (!deviceId) continue;
        const priorTransition = transitionedStates.get(deviceId);
        const reportedState = String(res.payload.operational_state ?? '');
        const flowRate = Number(res.payload.flow_rate_lpm ?? 0);
        const valvePos = Number(res.payload.valve_position_pct ?? 0);

        if (reportedState === 'IDLE' && flowRate > 0) {
          findings.push({
            findingId: `${testCase.id}-F${findingCounter++}`,
            testCaseId: testCase.id,
            testCaseTitle: testCase.title,
            timestamp,
            category: 'STATE_INCONSISTENCY',
            severity: 'HIGH',
            violatedRuleId: 'STATE-RULE-PUMP-IDLE',
            matchedProtectedFact: `State desynchronization on ${deviceId}: state is IDLE but flow_rate_lpm=${flowRate} L/min`,
            severityRationale: `Physical state-machine contradiction across sequence: ${deviceId} transitioned to IDLE in Step ${priorTransition?.stepNumber ?? 1}, yet Step ${res.stepNumber} telemetry reported active flow (${flowRate} L/min), exposing digital-twin simulation logic.`,
            inferredAcrossSteps: [priorTransition?.stepNumber ?? 1, res.stepNumber],
            requestSequence: testCase.steps,
            observedResponses: responses,
          });
        }

        if (reportedState === 'MAINTENANCE' && valvePos > 0) {
          findings.push({
            findingId: `${testCase.id}-F${findingCounter++}`,
            testCaseId: testCase.id,
            testCaseTitle: testCase.title,
            timestamp,
            category: 'STATE_INCONSISTENCY',
            severity: 'HIGH',
            violatedRuleId: 'STATE-RULE-VALVE-LOCKOUT',
            matchedProtectedFact: `State desynchronization on ${deviceId}: state is MAINTENANCE lockout but valve_position_pct=${valvePos}%`,
            severityRationale: `Physical state-machine contradiction across sequence: ${deviceId} entered MAINTENANCE lockout in Step ${priorTransition?.stepNumber ?? 1}, yet Step ${res.stepNumber} reported ${valvePos}% open valve aperture.`,
            inferredAcrossSteps: [priorTransition?.stepNumber ?? 1, res.stepNumber],
            requestSequence: testCase.steps,
            observedResponses: responses,
          });
        }
      }
    }
  }

  return { findings, containmentEvents };
}

export function runAuditSuite(
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig,
  mode: AuditMode = 'full_sequence',
  extraHarmlessCount = 0,
  baselineLeakageCountForEffectiveness = 10
): AuditRunResult {
  const timestamp = new Date().toISOString();
  const sequences: TestSequence[] = [
    ...CORE_TEST_SEQUENCES,
    ...(extraHarmlessCount > 0 ? generateExtraHarmlessSequences(extraHarmlessCount) : []),
  ];

  const records: SequenceExecutionRecord[] = [];
  const allFindings: AuditFinding[] = [];
  const allContainmentEvents: EgressEventRecord[] = [];

  let totalLatencyMs = 0;
  let totalStepsCount = 0;
  let validNormalSteps = 0;

  for (const seq of sequences) {
    const session = createInitialSessionState();
    const responses: SimulatorResponse[] = [];
    let seqTimeMs = 0;

    for (const step of seq.steps) {
      const resp = simulateStep(step, mitigationConfig, registry, session);
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

  // Multi-step inference sequences specifically designed to test protected relationship recovery
  const multiStepRelCases = records.filter(
    (r) => r.testCase.leakageType === 'MULTI_STEP_INFERENCE'
  );
  const recoveredRelCases = multiStepRelCases.filter((r) =>
    r.findings.some((f) => f.category === 'MULTI_STEP_INFERENCE')
  );

  // When mitigations are applied, leakageRecall measures how many seeded leakage cases STILL occur (or are detected as active leaks).
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
    runId: `RUN-${mode.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    timestamp,
    mode,
    modeLabel: AUDIT_MODE_LABELS[mode],
    mitigationConfig: { ...mitigationConfig },
    metrics,
    records,
    findings: allFindings,
    containmentEvents: allContainmentEvents,
  };
}

export function compareMitigationRuns(
  registry: ProtectedRegistry,
  mitigatedConfig: MitigationConfig
): MitigationComparison {
  const baselineRun = runAuditSuite(registry, BASELINE_MITIGATION_CONFIG, 'full_sequence', 0, 10);
  const mitigatedRun = runAuditSuite(
    registry,
    mitigatedConfig,
    'full_sequence',
    0,
    baselineRun.metrics.detectedLeakageCases
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

export function runAllAblations(registry: ProtectedRegistry): AblationStudyRow[] {
  const approachA = runAuditSuite(registry, BASELINE_MITIGATION_CONFIG, 'manual_spot', 0, 10);
  const ablation1 = runAuditSuite(registry, BASELINE_MITIGATION_CONFIG, 'single_response', 0, 10);
  const ablation2 = runAuditSuite(
    registry,
    BASELINE_MITIGATION_CONFIG,
    'sequence_no_consistency',
    0,
    10
  );
  const proposedBaseline = runAuditSuite(
    registry,
    BASELINE_MITIGATION_CONFIG,
    'full_sequence',
    0,
    10
  );
  const ablation3Mitigated = runAuditSuite(
    registry,
    FULL_MITIGATION_CONFIG,
    'full_sequence',
    0,
    proposedBaseline.metrics.detectedLeakageCases
  );
  const ablation4ScaledHarmless = runAuditSuite(
    registry,
    BASELINE_MITIGATION_CONFIG,
    'full_sequence',
    20,
    10
  );

  return [
    {
      id: 'APPROACH-A',
      name: 'Baseline A: Manual Spot Checks',
      description:
        'Simulates manual operator spot inspection of primary PLC and pump endpoints without automated rule or sequence correlation.',
      mode: 'manual_spot',
      mitigated: false,
      extraHarmless: 0,
      metrics: approachA.metrics,
    },
    {
      id: 'ABLATION-1',
      name: 'Baseline B / Ablation 1: Single-Response Rules Only',
      description:
        'Disables sequence analysis and checks each response independently. Misses multi-step relationship inference and cross-step state desync.',
      mode: 'single_response',
      mitigated: false,
      extraHarmless: 0,
      metrics: ablation1.metrics,
    },
    {
      id: 'ABLATION-2',
      name: 'Ablation 2: Sequence Audit without State Consistency',
      description:
        'Enables multi-step join key inference across sequences but disables OT physical state-machine consistency rules.',
      mode: 'sequence_no_consistency',
      mitigated: false,
      extraHarmless: 0,
      metrics: ablation2.metrics,
    },
    {
      id: 'PROPOSED-C',
      name: 'Proposed C: Full DeceptionGuard-OT Sequence Audit (Pre-Mitigation)',
      description:
        'Combines single-step canary/field rules, multi-step relationship inference, state-machine consistency, and egress containment checks.',
      mode: 'full_sequence',
      mitigated: false,
      extraHarmless: 0,
      metrics: proposedBaseline.metrics,
    },
    {
      id: 'ABLATION-3',
      name: 'Ablation 3: Post-Mitigation Retest Verification',
      description:
        'Reruns the exact 20-case suite after applying all 6 hardening policies to measure leakage reduction and normal behavior preservation.',
      mode: 'full_sequence',
      mitigated: true,
      extraHarmless: 0,
      metrics: ablation3Mitigated.metrics,
    },
    {
      id: 'ABLATION-4',
      name: 'Ablation 4: Expanded Harmless Suite (30 Harmless + 10 Leakage)',
      description:
        'Scales normal SCADA multi-step polling cases from 10 to 30 to verify zero false-positive drift under high harmless traffic volume.',
      mode: 'full_sequence',
      mitigated: false,
      extraHarmless: 20,
      metrics: ablation4ScaledHarmless.metrics,
    },
  ];
}
