import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_MITIGATION_CONFIG,
  DEFAULT_PROTECTED_REGISTRY,
  FULL_MITIGATION_CONFIG,
} from './registry';
import {
  compareMitigationRuns,
  runAllAblations,
  runAuditSuite,
} from './auditor';
import { createInitialSessionState, simulateStep } from './simulator';

test('Module 1 & 2: Simulated Honeypot exposes seeded canary TEST-SECRET-42 on unmitigated C-201 config', () => {
  const session = createInitialSessionState();
  const res = simulateStep(
    {
      stepNumber: 1,
      method: 'GET',
      endpoint: '/ot/config/C-201',
      params: { profile: 'commissioning' },
      description: 'Test commissioning config leak',
    },
    BASELINE_MITIGATION_CONFIG,
    DEFAULT_PROTECTED_REGISTRY,
    session
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.commissioning_auth_token, 'TEST-SECRET-42');
  assert.equal(res.validNormalInteraction, true);
});

test('Module 4 (RQ1 & RQ2): Sequence-based auditor detects all 10 seeded leakage cases with 0% false positives', () => {
  const result = runAuditSuite(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG,
    'full_sequence'
  );

  assert.equal(result.metrics.totalTestCases, 20);
  assert.equal(result.metrics.seededLeakageCases, 10);
  assert.equal(result.metrics.harmlessCases, 10);
  assert.equal(result.metrics.truePositiveCount, 10);
  assert.equal(result.metrics.falsePositiveCount, 0);
  assert.equal(result.metrics.leakageRecallPct, 100.0);
  assert.equal(result.metrics.precisionPct, 100.0);
  assert.equal(result.metrics.falsePositiveRatePct, 0.0);
  assert.equal(result.metrics.inferenceSuccessRatePct, 100.0);
});

test('Ablation 1 (RQ2): Single-response rules miss multi-step relationship inference and state desync leaks', () => {
  const singleStepResult = runAuditSuite(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG,
    'single_response'
  );

  // Single-response rules catch the 5 single-step canary/field/error cases (TC-L01, TC-L03, TC-L05, TC-L09, TC-L10)
  // but miss the 3 multi-step relationship inference cases (TC-L02, TC-L04, TC-L06) and 2 state consistency cases (TC-L07, TC-L08)
  assert.equal(singleStepResult.metrics.truePositiveCount, 5);
  assert.equal(singleStepResult.metrics.leakageRecallPct, 50.0);
  assert.equal(singleStepResult.metrics.inferenceSuccessRatePct, 0.0);
});

test('Ablation 2: Disabling state consistency checks catches multi-step relationships (80% recall) but misses physical state desyncs', () => {
  const noConsistencyResult = runAuditSuite(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG,
    'sequence_no_consistency'
  );

  assert.equal(noConsistencyResult.metrics.truePositiveCount, 8);
  assert.equal(noConsistencyResult.metrics.leakageRecallPct, 80.0);
  assert.equal(noConsistencyResult.metrics.inferenceSuccessRatePct, 100.0);
});

test('Module 7 & Ablation 3 (RQ3): Full mitigation eliminates all 10 leaks (100% effectiveness) while preserving 100% normal behavior', () => {
  const comparison = compareMitigationRuns(
    DEFAULT_PROTECTED_REGISTRY,
    FULL_MITIGATION_CONFIG
  );

  assert.equal(comparison.baselineRun.metrics.detectedLeakageCases, 10);
  assert.equal(comparison.mitigatedRun.metrics.detectedLeakageCases, 0);
  assert.equal(comparison.leakageReductionCount, 10);
  assert.equal(comparison.mitigationEffectivenessPct, 100.0);
  assert.equal(comparison.realismPreservedPct, 100.0);
  assert.equal(
    comparison.caseComparisons.filter((c) => c.status === 'RESOLVED').length,
    10
  );
});

test('Ablation 4 (RQ4): Scaling harmless sequences to 30 maintains 0.0% false-positive rate', () => {
  const ablations = runAllAblations(DEFAULT_PROTECTED_REGISTRY);
  const ablation4 = ablations.find((a) => a.id === 'ABLATION-4');
  assert.ok(ablation4);
  assert.equal(ablation4.metrics.harmlessCases, 30);
  assert.equal(ablation4.metrics.falsePositiveCount, 0);
  assert.equal(ablation4.metrics.falsePositiveRatePct, 0.0);
});

test('Standalone Software Packager: Generates valid Python 3 CLI, Node CLI, and deterministic terminal output', async () => {
  const {
    generatePythonCliScript,
    generateNodeCliScript,
    generatePortableInstallerBundle,
    simulateCliTerminalExecution,
  } = await import('./softwarePackager');

  const pyScript = generatePythonCliScript(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG
  );
  assert.ok(pyScript.startsWith('#!/usr/bin/env python3'));
  assert.ok(pyScript.includes('TEST-SECRET-42'));
  assert.ok(pyScript.includes('SimulatedOTHoneypot'));

  const nodeScript = generateNodeCliScript(
    DEFAULT_PROTECTED_REGISTRY,
    FULL_MITIGATION_CONFIG
  );
  assert.ok(nodeScript.startsWith('#!/usr/bin/env node'));

  const bundleScript = generatePortableInstallerBundle(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG
  );
  assert.ok(bundleScript.includes('deceptionguard-ot-lab'));

  const termOut = simulateCliTerminalExecution(
    'compare-mitigation',
    DEFAULT_PROTECTED_REGISTRY,
    FULL_MITIGATION_CONFIG
  );
  assert.equal(termOut.exitCode, 0);
  assert.ok(termOut.outputLines.some((line) => line.includes('100.0%')));
});

test('Target Connection & Live Process Manager: Validates lab subnet guardrails and audits live TCP process', async () => {
  const { validateLabTargetSubnet } = await import('./targetTypes');
  const { runLiveNetworkAuditSuite } = await import('./liveAuditor');
  const { spawn } = await import('node:child_process');
  const path = await import('node:path');

  const loopCheck = validateLabTargetSubnet('http://127.0.0.1:4049', true);
  assert.equal(loopCheck.subnetAllowed, true);

  const privateCheck = validateLabTargetSubnet('http://10.24.0.15:8080', true);
  assert.equal(privateCheck.subnetAllowed, true);

  const publicBlocked = validateLabTargetSubnet('https://8.8.8.8:443', true);
  assert.equal(publicBlocked.subnetAllowed, false);

  const daemonScript = path.resolve(process.cwd(), 'src/core/honeypotDaemon.mjs');
  const child = spawn(process.execPath, [daemonScript, '--port', '4049'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Daemon startup timeout')), 3000);
      child.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('Listening on')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const liveResult = await runLiveNetworkAuditSuite(
      {
        mode: 'local_process_bridge',
        baseUrl: 'http://127.0.0.1:4049',
        localProcessPort: 4049,
        authType: 'none',
        authToken: '',
        customHeaderName: 'X-OT-Auditor-Session',
        customHeaderValue: 'UNIT-TEST',
        timeoutMs: 3000,
        enforcePrivateLabSubnet: true,
      },
      DEFAULT_PROTECTED_REGISTRY,
      BASELINE_MITIGATION_CONFIG,
      'full_sequence'
    );

    assert.equal(liveResult.metrics.totalTestCases, 20);
    assert.equal(liveResult.metrics.truePositiveCount, 10);
    assert.equal(liveResult.metrics.falsePositiveCount, 0);
    assert.equal(liveResult.metrics.leakageRecallPct, 100.0);
  } finally {
    child.kill('SIGTERM');
  }
});

test('3D Purdue Model & Water-Treatment Plant Engine: Computes 3 visual modes, inference laser bridges, desync anomalies, and containment forcefield', async () => {
  const { buildSceneTelemetrySnapshot } = await import('./purdue3dEngine');
  const auditResult = runAuditSuite(
    DEFAULT_PROTECTED_REGISTRY,
    BASELINE_MITIGATION_CONFIG,
    'full_sequence'
  );

  // 1. Check TC-L02 Cross-Endpoint Inference Laser Bridge in Plant Floor mode
  const snapL02 = buildSceneTelemetrySnapshot(
    auditResult,
    BASELINE_MITIGATION_CONFIG,
    DEFAULT_PROTECTED_REGISTRY,
    'TC-L02',
    2,
    'plant_floor'
  );
  assert.equal(snapL02.nodes.length, 6);
  const rel01 = snapL02.inferenceBridges.find((b) => b.id === 'BRIDGE-REL-01');
  assert.ok(rel01);
  assert.equal(rel01.activeInCurrentSequence, true);
  assert.equal(rel01.leaked, true);
  assert.equal(rel01.joinToken, 'LOOP-REF-884');

  // 2. Check TC-L07 Cyber-Physical State Desync Anomaly in Purdue Stack mode
  const snapL07 = buildSceneTelemetrySnapshot(
    auditResult,
    BASELINE_MITIGATION_CONFIG,
    DEFAULT_PROTECTED_REGISTRY,
    'TC-L07',
    1,
    'purdue_stack'
  );
  const p101 = snapL07.nodes.find((n) => n.id === 'P-101');
  assert.ok(p101);
  assert.equal(p101.hasStateDesyncAnomaly, true);
  assert.equal(p101.purdueLevel, 'L0');
  assert.equal(p101.activePos.y, -5.2);

  // 3. Check TC-L10 Containment Forcefield Breach vs Deflection
  const snapL10Unmitigated = buildSceneTelemetrySnapshot(
    auditResult,
    BASELINE_MITIGATION_CONFIG,
    DEFAULT_PROTECTED_REGISTRY,
    'TC-L10',
    0,
    'force_graph'
  );
  assert.equal(snapL10Unmitigated.containmentShield.verdict, 'BREACHED_UNMITIGATED');

  const snapL10Mitigated = buildSceneTelemetrySnapshot(
    auditResult,
    FULL_MITIGATION_CONFIG,
    DEFAULT_PROTECTED_REGISTRY,
    'TC-L10',
    0,
    'force_graph'
  );
  assert.equal(snapL10Mitigated.containmentShield.verdict, 'DEFLECTED_SHIELD_ACTIVE');
});



