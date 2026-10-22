import React from 'react';
import { MitigationComparison, MitigationConfig } from '../core/types';

interface MitigationRetestViewProps {
  mitigationConfig: MitigationConfig;
  comparison: MitigationComparison;
  onTogglePolicy: (key: keyof MitigationConfig) => void;
  onApplyAllMitigations: () => void;
  onResetBaseline: () => void;
}

const MITIGATION_POLICIES: Array<{
  key: keyof MitigationConfig;
  title: string;
  targetCases: string;
  description: string;
}> = [
  {
    key: 'redactCanaryTokens',
    title: '01. Redact Seeded Synthetic Canary Tokens',
    targetCases: 'TC-L01, TC-L05',
    description:
      'Sanitizes commissioning_auth_token (TEST-SECRET-42), gateway_session_canary (OT-CANARY-991-AUTH), and historian archive keys from outbound payloads.',
  },
  {
    key: 'stripProhibitedFields',
    title: '02. Strip Prohibited Decoy & Subnet Fields',
    targetCases: 'TC-L03, TC-L10',
    description:
      'Removes honeypot_template_id, internal_subnet, and shadow_plc_mapping from device descriptor and register dump responses.',
  },
  {
    key: 'unlinkRelationshipJoinKeys',
    title: '03. Mask Cross-Endpoint Relationship Join Tokens',
    targetCases: 'TC-L02, TC-L04, TC-L06',
    description:
      'Replaces shared internal correlation handles (LOOP-REF-884, BUS-FAILSAFE-19, MIRROR-STREAM-77) with device-scoped opaque tokens so multi-step queries cannot infer hidden topology links.',
  },
  {
    key: 'enforceStateConsistency',
    title: '04. Enforce Digital-Twin State-Machine Consistency',
    targetCases: 'TC-L07, TC-L08',
    description:
      'Synchronizes physical process telemetry with state transitions (sets Pump P-101 flow to 0.0 L/min when IDLE and Valve V-302 aperture to 0% during MAINTENANCE lockout).',
  },
  {
    key: 'normalizeErrorMessages',
    title: '05. Normalize Protocol Exception Templates',
    targetCases: 'TC-L09',
    description:
      'Replaces raw Python/FastAPI stack traces on out-of-range Modbus register reads with standard 0x02_ILLEGAL_DATA_ADDRESS industrial exception frames.',
  },
  {
    key: 'enforceStrictEgressAllowlist',
    title: '06. Enforce Deny-by-Default Network Egress Containment',
    targetCases: 'TC-L10',
    description:
      'Blocks any simulator outbound traffic to non-allowlisted hosts outside 127.0.0.1 and 10.240.0.0/24 while preserving local lab Modbus/OPC-UA polling.',
  },
];

export const MitigationRetestView: React.FC<MitigationRetestViewProps> = ({
  mitigationConfig,
  comparison,
  onTogglePolicy,
  onApplyAllMitigations,
  onResetBaseline,
}) => {
  const enabledCount = Object.values(mitigationConfig).filter(Boolean).length;
  const { baselineRun, mitigatedRun, caseComparisons } = comparison;

  return (
    <div className="space-y-8">
      {/* Header & Quick Remediation Controls */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="text-xs text-slate-500 font-mono">
              Module 7 — Mitigation Verification & Before/After Retest Engine (RQ3)
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Remediation Policy Controls & Automated Retest Verification
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Toggle individual honeypot hardening controls or apply the complete remediation
              profile. DeceptionGuard-OT automatically reruns the exact same 20-sequence suite and
              compares before-and-after leakage, false alarms, and normal simulated behavior.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onResetBaseline}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reset to Vulnerable Baseline (0/6)
            </button>
            <button
              type="button"
              onClick={onApplyAllMitigations}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Apply All Recommended Mitigations & Retest
            </button>
          </div>
        </div>
      </section>

      {/* Before vs After Summary Strip */}
      <section className="bg-white grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-lg">
        <div className="p-4">
          <div className="text-xs text-slate-500">Baseline Active Leaks</div>
          <div className="mt-1 text-2xl font-bold text-red-700 font-mono tabular-nums">
            {baselineRun.metrics.detectedLeakageCases} / 10
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
            Pre-mitigation suite
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Post-Mitigation Leaks</div>
          <div
            className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
              mitigatedRun.metrics.detectedLeakageCases === 0
                ? 'text-emerald-700'
                : 'text-amber-700'
            }`}
          >
            {mitigatedRun.metrics.detectedLeakageCases} / 10
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
            {comparison.leakageReductionCount} leaks eliminated
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Mitigation Effectiveness</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {comparison.mitigationEffectivenessPct.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
            {enabledCount} / 6 policies active
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Normal Behavior Realism</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {comparison.realismPreservedPct.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
            Zero broken SCADA polls
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Retest Overhead Delta</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            +{Math.max(0, mitigatedRun.metrics.runtimeOverheadMs - baselineRun.metrics.runtimeOverheadMs)} ms
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
            {baselineRun.metrics.runtimeOverheadMs} ms → {mitigatedRun.metrics.runtimeOverheadMs} ms
          </div>
        </div>
      </section>

      {/* 6 Interactive Policy Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MITIGATION_POLICIES.map((pol) => {
          const isEnabled = mitigationConfig[pol.key];
          return (
            <div
              key={pol.key}
              className={`p-4 border rounded-lg transition-colors flex flex-col justify-between gap-4 bg-white ${
                isEnabled ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-slate-500">Targets: {pol.targetCases}</span>
                  <span
                    className={
                      isEnabled
                        ? 'text-emerald-700 font-semibold'
                        : 'text-amber-700 font-semibold'
                    }
                  >
                    {isEnabled ? 'ENABLED' : 'UNMITIGATED'}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-slate-900">{pol.title}</h2>
                <p className="text-xs text-slate-600 leading-relaxed">{pol.description}</p>
              </div>

              <button
                type="button"
                onClick={() => onTogglePolicy(pol.key)}
                aria-pressed={isEnabled}
                className={`w-full py-2 px-3 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  isEnabled
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isEnabled ? 'Disable Mitigation Policy' : 'Enable Mitigation Policy'}
              </button>
            </div>
          );
        })}
      </section>

      {/* Side-by-Side Before & After Retest Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Before-and-After Retest Comparison Matrix (All 20 Test Sequences)
            </h2>
            <p className="text-xs text-slate-500">
              Compares baseline unmitigated execution against post-mitigation retest across every
              seeded leakage and harmless control sequence.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600">
            Resolved:{' '}
            <strong className="text-emerald-700">
              {caseComparisons.filter((c) => c.status === 'RESOLVED').length} / 10
            </strong>{' '}
            · Persisting:{' '}
            <strong className="text-red-700">
              {caseComparisons.filter((c) => c.status === 'PERSISTING_LEAK').length} / 10
            </strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                <th className="py-2.5 px-3 font-mono">Case ID</th>
                <th className="py-2.5 px-3">Test Sequence Title</th>
                <th className="py-2.5 px-3 font-mono">Leakage Category</th>
                <th className="py-2.5 px-3 font-mono">Before (Baseline)</th>
                <th className="py-2.5 px-3 font-mono">After (Retest)</th>
                <th className="py-2.5 px-3 font-mono">Normal Realism</th>
                <th className="py-2.5 px-3 font-mono">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {caseComparisons.map((row) => (
                <tr key={row.testCaseId} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                    {row.testCaseId}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{row.title}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">
                    {row.leakageType ?? 'HARMLESS_CONTROL'}
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {row.baselineLeaked ? (
                      <span className="text-red-700 font-semibold">LEAK EXPOSED</span>
                    ) : (
                      <span className="text-slate-600">NO LEAK</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {row.postMitigationLeaked ? (
                      <span className="text-red-700 font-semibold">LEAK EXPOSED</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">CLEAN (0 LEAKS)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                    {row.postMitigationNormalValid ? '100% VALID' : 'BROKEN'}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold">
                    {row.status === 'RESOLVED' ? (
                      <span className="text-emerald-700">RESOLVED BY FIX</span>
                    ) : row.status === 'PERSISTING_LEAK' ? (
                      <span className="text-red-700">PERSISTING LEAK</span>
                    ) : (
                      <span className="text-slate-600">VERIFIED HARMLESS</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
