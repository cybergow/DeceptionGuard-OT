import { AblationStudyRow, AuditRunResult, MitigationComparison } from '../core/types';

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAuditJson(
  runResult: AuditRunResult,
  comparison: MitigationComparison,
  ablations: AblationStudyRow[]
) {
  const payload = {
    project: 'DeceptionGuard-OT: Automated Discovery and Verification of Information-Leakage Paths in Digital-Twin Industrial Honeypots',
    generatedAt: new Date().toISOString(),
    activeAuditRun: runResult,
    mitigationVerification: {
      leakageReductionCount: comparison.leakageReductionCount,
      mitigationEffectivenessPct: comparison.mitigationEffectivenessPct,
      realismPreservedPct: comparison.realismPreservedPct,
      caseComparisons: comparison.caseComparisons,
    },
    ablationStudy: ablations,
  };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `deceptionguard-ot-audit-${runResult.mode}.json`,
    'application/json'
  );
}

export function exportAuditCsv(runResult: AuditRunResult, comparison: MitigationComparison) {
  const headers = [
    'TestCaseID',
    'Title',
    'Category',
    'LeakageType',
    'MultiStepSequence',
    'StepCount',
    'BaselineLeaked',
    'CurrentRunDetectedLeak',
    'PostMitigationLeaked',
    'FindingsCount',
    'NormalInteractionValid',
    'LatencyMs',
    'StatusAfterMitigation',
  ];

  const rows = runResult.records.map((rec) => {
    const comp = comparison.caseComparisons.find((c) => c.testCaseId === rec.testCase.id);
    return [
      rec.testCase.id,
      `"${rec.testCase.title.replace(/"/g, '""')}"`,
      rec.testCase.category,
      rec.testCase.leakageType ?? 'NONE',
      rec.testCase.requiresMultiStep ? 'YES' : 'NO',
      rec.testCase.steps.length,
      comp?.baselineLeaked ? 'YES' : 'NO',
      rec.detectedLeakage ? 'YES' : 'NO',
      comp?.postMitigationLeaked ? 'YES' : 'NO',
      rec.findings.length,
      rec.normalInteractionsValid ? 'VALID' : 'BROKEN',
      rec.executionTimeMs,
      comp?.status ?? 'N/A',
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  triggerDownload(
    csvContent,
    `deceptionguard-ot-results-${runResult.mode}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportAuditHtml(
  runResult: AuditRunResult,
  comparison: MitigationComparison,
  ablations: AblationStudyRow[]
) {
  const m = runResult.metrics;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DeceptionGuard-OT Audit & Mitigation Verification Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 40px; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .meta { color: #475569; font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .metric { border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; }
    .metric-label { font-size: 12px; color: #475569; }
    .metric-val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-variant-numeric: tabular-nums; }
    th { background: #f8fafc; font-weight: 600; }
  </style>
</head>
<body>
  <h1>DeceptionGuard-OT — Evidence-Backed Audit Report</h1>
  <div class="meta">
    Mode: ${runResult.modeLabel} · Run ID: ${runResult.runId} · Timestamp: ${runResult.timestamp}
  </div>

  <div class="grid">
    <div class="metric"><div class="metric-label">Leakage Recall</div><div class="metric-val">${m.leakageRecallPct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Precision</div><div class="metric-val">${m.precisionPct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">False-Positive Rate</div><div class="metric-val">${m.falsePositiveRatePct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Multi-Step Inference Rate</div><div class="metric-val">${m.inferenceSuccessRatePct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Mitigation Effectiveness</div><div class="metric-val">${comparison.mitigationEffectivenessPct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Normal-Interaction Success</div><div class="metric-val">${m.normalInteractionSuccessPct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Total Audit Overhead</div><div class="metric-val">${m.runtimeOverheadMs} ms</div></div>
    <div class="metric"><div class="metric-label">Active Findings</div><div class="metric-val">${runResult.findings.length}</div></div>
  </div>

  <h2>Ablation & Baseline Comparison Matrix</h2>
  <table>
    <thead>
      <tr>
        <th>Experiment / Approach</th>
        <th>Recall (%)</th>
        <th>Precision (%)</th>
        <th>False-Positive Rate (%)</th>
        <th>Inference Rate (%)</th>
        <th>Normal Behavior (%)</th>
        <th>Overhead (ms)</th>
      </tr>
    </thead>
    <tbody>
      ${ablations
        .map(
          (a) => `<tr>
        <td>${a.name}</td>
        <td>${a.metrics.leakageRecallPct.toFixed(1)}%</td>
        <td>${a.metrics.precisionPct.toFixed(1)}%</td>
        <td>${a.metrics.falsePositiveRatePct.toFixed(1)}%</td>
        <td>${a.metrics.inferenceSuccessRatePct.toFixed(1)}%</td>
        <td>${a.metrics.normalInteractionSuccessPct.toFixed(1)}%</td>
        <td>${a.metrics.runtimeOverheadMs} ms</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <h2>Evidence-Backed Findings (${runResult.findings.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Finding ID</th>
        <th>Test Case</th>
        <th>Category</th>
        <th>Severity</th>
        <th>Steps Correlated</th>
        <th>Matched Protected Fact</th>
        <th>Rationale</th>
      </tr>
    </thead>
    <tbody>
      ${
        runResult.findings.length === 0
          ? '<tr><td colspan="7">Zero active leakage findings detected (All seeded leaks mitigated).</td></tr>'
          : runResult.findings
              .map(
                (f) => `<tr>
        <td>${f.findingId}</td>
        <td>${f.testCaseId}: ${f.testCaseTitle}</td>
        <td>${f.category}</td>
        <td>${f.severity}</td>
        <td>Steps ${f.inferredAcrossSteps.join(' -> ')}</td>
        <td>${f.matchedProtectedFact}</td>
        <td>${f.severityRationale}</td>
      </tr>`
              )
              .join('')
      }
    </tbody>
  </table>
</body>
</html>`;

  triggerDownload(
    html,
    `deceptionguard-ot-report-${runResult.mode}.html`,
    'text/html;charset=utf-8;'
  );
}
