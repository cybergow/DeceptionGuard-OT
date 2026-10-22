import React, { useMemo, useState } from 'react';
import {
  AuditMode,
  AuditRunResult,
  MitigationConfig,
  ProtectedRegistry,
  SequenceExecutionRecord,
} from '../core/types';
import { ManagedProcessStatus, TargetConnectionConfig } from '../core/targetTypes';
import { AUDIT_MODE_LABELS } from '../core/auditor';
import { ThreeDPlantTopologyStudio } from './ThreeDPlantTopologyStudio';

interface AuditEvidenceViewProps {
  auditResult: AuditRunResult;
  activeMode: AuditMode;
  mitigationConfig: MitigationConfig;
  registry: ProtectedRegistry;
  targetConfig: TargetConnectionConfig;
  processStatus: ManagedProcessStatus;
  isAuditingNetwork: boolean;
  onSelectMode: (mode: AuditMode) => void;
  onRunAudit: () => void;
  onNavigateMitigation: () => void;
  onOpenTargetModal: () => void;
  onOpenDownloadModal: () => void;
  onRefreshLogs: () => void;
  onClearLogs: () => void;
  onToggleMitigationPolicy: (key: keyof MitigationConfig) => void;
  onApplyAllMitigations: () => void;
  onResetBaseline: () => void;
}

export const AuditEvidenceView: React.FC<AuditEvidenceViewProps> = ({
  auditResult,
  activeMode,
  mitigationConfig,
  registry,
  targetConfig,
  processStatus,
  isAuditingNetwork,
  onSelectMode,
  onRunAudit,
  onNavigateMitigation,
  onOpenTargetModal,
  onOpenDownloadModal,
  onRefreshLogs,
  onClearLogs,
  onToggleMitigationPolicy,
  onApplyAllMitigations,
  onResetBaseline,
}) => {
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string>('TC-L02');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'leakage' | 'harmless' | 'multistep' | 'flagged'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNetworkDrawer, setShowNetworkDrawer] = useState<boolean>(true);

  const activeMitigationCount = Object.values(mitigationConfig).filter(Boolean).length;

  const targetModeSummary =
    targetConfig.mode === 'builtin_simulator'
      ? 'Built-In In-Memory Simulator (Default Reference Lab)'
      : targetConfig.mode === 'local_process_bridge'
      ? `Live OS Process Bridge (${targetConfig.baseUrl}${
          processStatus.running && processStatus.pid ? ` · PID ${processStatus.pid}` : ''
        })`
      : `Live Remote HTTP Server (${targetConfig.baseUrl})`;

  const filteredRecords = useMemo(() => {
    return auditResult.records.filter((rec) => {
      if (categoryFilter === 'leakage' && rec.testCase.category !== 'leakage') return false;
      if (categoryFilter === 'harmless' && rec.testCase.category !== 'harmless') return false;
      if (categoryFilter === 'multistep' && !rec.testCase.requiresMultiStep) return false;
      if (categoryFilter === 'flagged' && !rec.detectedLeakage) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchId = rec.testCase.id.toLowerCase().includes(q);
        const matchTitle = rec.testCase.title.toLowerCase().includes(q);
        const matchDesc = rec.testCase.description.toLowerCase().includes(q);
        const matchType = (rec.testCase.leakageType ?? '').toLowerCase().includes(q);
        return matchId || matchTitle || matchDesc || matchType;
      }
      return true;
    });
  }, [auditResult.records, categoryFilter, searchQuery]);

  const selectedRecord: SequenceExecutionRecord | undefined = useMemo(() => {
    return (
      auditResult.records.find((r) => r.testCase.id === selectedTestCaseId) ??
      filteredRecords[0] ??
      auditResult.records[0]
    );
  }, [auditResult.records, filteredRecords, selectedTestCaseId]);

  const { metrics } = auditResult;

  return (
    <div className="space-y-8">
      {/* Context Banner & Auditor Mode Selector */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>
                Target:{' '}
                <strong
                  className={
                    targetConfig.mode === 'builtin_simulator'
                      ? 'text-slate-900'
                      : 'text-emerald-700'
                  }
                >
                  {targetModeSummary}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>Run ID: {auditResult.runId}</span>
              <span aria-hidden="true">·</span>
              <span>Mitigations: {activeMitigationCount} / 6 Active</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Multi-Interaction Leakage Discovery & Evidence Console
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Executes planned single-step and multi-step request sequences against either the
              built-in digital-twin simulator, a spawned local honeypot OS process, or an external
              HTTP/OT lab server to detect seeded canary secrets, prohibited fields, cross-endpoint
              relationship inferences, and physical state desynchronizations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenTargetModal}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {targetConfig.mode === 'builtin_simulator'
                ? 'Connect Target / Process'
                : `Target: ${
                    targetConfig.mode === 'local_process_bridge'
                      ? `PID ${processStatus.pid ?? 'Local'}`
                      : 'Remote HTTP'
                  }`}
            </button>
            <button
              type="button"
              onClick={onNavigateMitigation}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Mitigations ({activeMitigationCount}/6)
            </button>
            <button
              type="button"
              onClick={onOpenDownloadModal}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Download Software
            </button>
            <button
              type="button"
              disabled={isAuditingNetwork}
              onClick={onRunAudit}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAuditingNetwork ? 'Running Network Audit...' : 'Re-Execute Test Suite'}
            </button>
          </div>
        </div>

        {/* Approach / Ablation Mode Selector */}
        <div className="pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs font-medium text-slate-600">
            Active Auditing Methodology (Section 13 & 14 Comparison):
          </div>
          <div
            role="group"
            aria-label="Auditing Methodology Selector"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(
              [
                ['manual_spot', 'A. Manual Spot Checks'],
                ['single_response', 'B. Single-Response Rules'],
                ['sequence_no_consistency', 'Ablation 2: No State Check'],
                ['full_sequence', 'C. Proposed Sequence Audit'],
              ] as const
            ).map(([modeKey, label]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => onSelectMode(modeKey)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === modeKey
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 7 Quantitative Metrics Strip (Section 13 of PDF) */}
      <section
        aria-label="Quantitative Evaluation Metrics"
        className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-4">
          <div className="text-xs text-slate-500">Leakage Recall</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.leakageRecallPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.truePositiveCount} / {metrics.seededLeakageCases} seeded cases
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Audit Precision</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.precisionPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.truePositiveCount} TP · {metrics.falsePositiveCount} FP
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">False-Positive Rate</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {metrics.falsePositiveRatePct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.falsePositiveCount} / {metrics.harmlessCases} harmless flagged
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Multi-Step Inference</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.inferenceSuccessRatePct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Cross-request correlation
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Mitigation Effect</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.mitigationEffectivenessPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Leakage reduction rate
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Normal Behavior</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {metrics.normalInteractionSuccessPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Valid OT response proxy
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Runtime Overhead</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.runtimeOverheadMs} ms
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Avg {metrics.avgStepLatencyMs} ms / request
          </div>
        </div>
      </section>

      {/* Multi-Layered 3D Purdue Model & Physical Water-Treatment Plant (WebGL / Three.js) */}
      <ThreeDPlantTopologyStudio
        auditResult={auditResult}
        mitigationConfig={mitigationConfig}
        registry={registry}
        selectedCaseId={selectedTestCaseId}
        onSelectCaseId={setSelectedTestCaseId}
        onToggleMitigationPolicy={onToggleMitigationPolicy}
        onApplyAllMitigations={onApplyAllMitigations}
        onResetBaseline={onResetBaseline}
      />

      {/* Main Split Workspace: Test Suite Table (Left) + Reproducible Sequence Evidence Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Labeled Test-Sequence Suite */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  01. Repeatable Test-Sequence Suite ({filteredRecords.length} of{' '}
                  {auditResult.records.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Select any single-step or multi-step test case to inspect its ordered request
                  trace and audit finding rationale.
                </p>
              </div>
              <div className="w-full sm:w-56">
                <label htmlFor="sequence-search" className="sr-only">
                  Search test sequences
                </label>
                <input
                  id="sequence-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID, device, or rule..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            {/* Interactive Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(
                [
                  ['all', `All Cases (${auditResult.records.length})`],
                  ['leakage', 'Seeded Leakage (10)'],
                  ['harmless', 'Harmless Controls (10)'],
                  ['multistep', 'Multi-Step Sequences (9)'],
                  ['flagged', `Active Findings (${auditResult.metrics.detectedLeakageCases})`],
                ] as const
              ).map(([filterKey, label]) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setCategoryFilter(filterKey)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === filterKey
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3 font-mono">Case ID</th>
                  <th className="py-2.5 px-3">Scenario & Ground Truth</th>
                  <th className="py-2.5 px-3 text-right">Steps</th>
                  <th className="py-2.5 px-3">Audit Outcome</th>
                  <th className="py-2.5 px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No test sequences match your current filter.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('all');
                          setSearchQuery('');
                        }}
                        className="text-slate-900 font-semibold underline ml-1 cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const isSelected = selectedRecord?.testCase.id === rec.testCase.id;
                    const isLeakage = rec.testCase.category === 'leakage';

                    return (
                      <tr
                        key={rec.testCase.id}
                        onClick={() => setSelectedTestCaseId(rec.testCase.id)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900/5 font-medium'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedTestCaseId(rec.testCase.id)}
                            className="text-left font-mono font-semibold text-slate-900 hover:underline focus:outline-none cursor-pointer"
                          >
                            {rec.testCase.id}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-900 font-medium">{rec.testCase.title}</div>
                          <div className="text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                            <span>{isLeakage ? 'Seeded Leak' : 'Harmless Control'}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {rec.testCase.requiresMultiStep ? 'Multi-step sequence' : 'Single-step'}
                            </span>
                            {rec.testCase.leakageType && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{rec.testCase.leakageType}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          {rec.testCase.steps.length}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                          {rec.detectedLeakage ? (
                            <span className="text-red-700 font-semibold">
                              LEAK DETECTED ({rec.findings.length})
                            </span>
                          ) : isLeakage ? (
                            activeMitigationCount > 0 ? (
                              <span className="text-emerald-700 font-semibold">
                                MITIGATED / CLEAN
                              </span>
                            ) : (
                              <span className="text-amber-700 font-semibold">
                                MISSED (FALSE NEG)
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600">PASS (HARMLESS)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {rec.executionTimeMs} ms
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right 5 Cols: Evidence-Backed Finding & Multi-Interaction Trace Inspector */}
        <section
          aria-label="Evidence-Backed Sequence Inspector"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200"
        >
          {selectedRecord ? (
            <>
              <div className="p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span>
                    Evidence Record: {selectedRecord.testCase.id} ·{' '}
                    {selectedRecord.testCase.requiresMultiStep
                      ? `${selectedRecord.testCase.steps.length}-Step Sequence`
                      : 'Single-Step Probe'}
                  </span>
                  <span>{selectedRecord.executionTimeMs} ms total</span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {selectedRecord.testCase.title}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedRecord.testCase.description}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-2 text-xs font-mono text-slate-600">
                  <span>
                    Expected Class:{' '}
                    <strong className="text-slate-900">
                      {selectedRecord.testCase.category.toUpperCase()}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Normal Behavior:{' '}
                    <strong className="text-emerald-700">
                      {selectedRecord.normalInteractionsValid ? 'VALID (200 OK)' : 'DEGRADED'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Auditor Mode:{' '}
                    <strong className="text-slate-900">{AUDIT_MODE_LABELS[activeMode]}</strong>
                  </span>
                </div>
              </div>

              {/* Findings Raised for this Sequence */}
              <div className="p-5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-900">
                  02. Auditor Findings & Rule Rationale ({selectedRecord.findings.length})
                </h3>

                {selectedRecord.findings.length === 0 ? (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-900">
                      Zero Leakage Findings Raised for {selectedRecord.testCase.id}
                    </div>
                    <p>
                      {selectedRecord.testCase.category === 'harmless'
                        ? 'This is a labeled harmless OT control sequence. The auditor correctly verified all responses without raising a false alarm.'
                        : activeMitigationCount > 0
                        ? 'Active mitigation policies successfully stripped or masked the protected information in this sequence while preserving valid OT responses.'
                        : `Under "${AUDIT_MODE_LABELS[activeMode]}", this multi-step or state-consistency leak was missed. Switch to "C. Proposed Sequence Audit" to detect it.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedRecord.findings.map((finding) => (
                      <div
                        key={finding.findingId}
                        className="p-3.5 bg-red-50/40 border border-red-200 rounded-md space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-600">
                          <span>
                            <strong className="text-red-700">{finding.severity}</strong> · Rule{' '}
                            {finding.violatedRuleId} · {finding.category}
                          </span>
                          <span>
                            Correlated Steps: {finding.inferredAcrossSteps.join(' → ')}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900 font-mono text-xs">
                          {finding.matchedProtectedFact}
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          {finding.severityRationale}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ordered Multi-Step Request / Response Evidence Trace */}
              <div className="p-5 space-y-4">
                <h3 className="text-xs font-semibold text-slate-900">
                  03. Ordered Request & Observed Response Trace ({selectedRecord.responses.length}{' '}
                  Steps)
                </h3>
                <div className="space-y-4">
                  {selectedRecord.testCase.steps.map((step, idx) => {
                    const resp = selectedRecord.responses[idx];
                    return (
                      <div
                        key={step.stepNumber}
                        className="border border-slate-200 rounded-md overflow-hidden"
                      >
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
                          <div className="font-mono font-semibold text-slate-900">
                            Step {step.stepNumber}: {step.method} {step.endpoint}
                          </div>
                          <div className="font-mono tabular-nums text-slate-500">
                            HTTP {resp?.statusCode ?? 200} · {resp?.latencyMs ?? 5} ms
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="text-xs text-slate-600">{step.description}</div>
                          {step.params && Object.keys(step.params).length > 0 && (
                            <div className="text-[11px] font-mono text-slate-500">
                              Query/Body Params: {JSON.stringify(step.params)}
                            </div>
                          )}
                          <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
                            {JSON.stringify(resp?.payload ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>

      {/* Live Process & Network Stream Console Drawer */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono">
            <strong className="text-slate-900">
              04. Live Process & Network Stream Console ({processStatus.logs.length} Events)
            </strong>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500">
              {processStatus.running
                ? `Local Daemon PID ${processStatus.pid} Listening on 127.0.0.1:${processStatus.port}`
                : targetConfig.mode === 'remote_http_proxy'
                ? `Proxying to ${targetConfig.baseUrl}`
                : 'Built-In In-Memory Simulator Active'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenTargetModal}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
            >
              Configure Target / Process
            </button>
            <button
              type="button"
              onClick={onRefreshLogs}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
            >
              Refresh Stream
            </button>
            <button
              type="button"
              onClick={onClearLogs}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
            >
              Clear Logs
            </button>
            <button
              type="button"
              onClick={() => setShowNetworkDrawer((v) => !v)}
              aria-expanded={showNetworkDrawer}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
            >
              {showNetworkDrawer ? 'Collapse Console' : 'Expand Console'}
            </button>
          </div>
        </div>

        {showNetworkDrawer && (
          <pre className="p-4 bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed max-h-56">
            {processStatus.logs.length === 0
              ? '[STREAM IDLE] Click "Connect Target / Process" to spawn a real local honeypot daemon process on port 4040 or connect an external lab server, then run an audit to stream live HTTP and process telemetry.'
              : processStatus.logs
                  .map(
                    (entry) =>
                      `${entry.timestamp.slice(11, 23)} [${entry.stream.toUpperCase()}] ${entry.line}`
                  )
                  .join('\n')}
          </pre>
        )}
      </section>
    </div>
  );
};
