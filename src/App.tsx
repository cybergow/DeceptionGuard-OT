/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BASELINE_MITIGATION_CONFIG,
  DEFAULT_PROTECTED_REGISTRY,
  FULL_MITIGATION_CONFIG,
} from './core/registry';
import {
  compareMitigationRuns,
  runAllAblations,
  runAuditSuite,
} from './core/auditor';
import {
  AuditMode,
  AuditRunResult,
  MitigationComparison,
  MitigationConfig,
  ProtectedRegistry,
} from './core/types';
import {
  DEFAULT_TARGET_CONFIG,
  ManagedProcessStatus,
  PingHandshakeResult,
  TargetConnectionConfig,
} from './core/targetTypes';
import { AuditEvidenceView } from './components/AuditEvidenceView';
import { HoneypotRegistryView } from './components/HoneypotRegistryView';
import { MitigationRetestView } from './components/MitigationRetestView';
import { EvaluationAblationView } from './components/EvaluationAblationView';
import { ArchitectureCicdView } from './components/ArchitectureCicdView';
import { SoftwareDownloadCenter } from './components/SoftwareDownloadModal';
import { TargetConnectionManager } from './components/TargetConnectionManager';
import { useOnlineStatus } from './utils/usePWAInstall';

type ActiveWorkspaceTab =
  | 'audit'
  | 'honeypot'
  | 'mitigation'
  | 'evaluation'
  | 'architecture';

const INITIAL_PROCESS_STATUS: ManagedProcessStatus = {
  running: false,
  pid: null,
  port: 4040,
  baseUrl: 'http://127.0.0.1:4040',
  startedAt: null,
  uptimeSeconds: 0,
  requestCount: 0,
  logs: [],
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('audit');
  const [registry, setRegistry] = useState<ProtectedRegistry>(() =>
    structuredClone(DEFAULT_PROTECTED_REGISTRY)
  );
  const [mitigationConfig, setMitigationConfig] = useState<MitigationConfig>(() =>
    structuredClone(BASELINE_MITIGATION_CONFIG)
  );
  const [auditMode, setAuditMode] = useState<AuditMode>('full_sequence');
  const [runCounter, setRunCounter] = useState<number>(1);

  // Target Connection & Live Process Manager State
  const [targetConfig, setTargetConfig] = useState<TargetConnectionConfig>(() =>
    structuredClone(DEFAULT_TARGET_CONFIG)
  );
  const [processStatus, setProcessStatus] = useState<ManagedProcessStatus>(INITIAL_PROCESS_STATUS);
  const [lastPingResult, setLastPingResult] = useState<PingHandshakeResult | null>(null);
  const [liveAuditResult, setLiveAuditResult] = useState<AuditRunResult | null>(null);
  const [liveComparisonResult, setLiveComparisonResult] = useState<MitigationComparison | null>(
    null
  );
  const [isNetworkBusy, setIsNetworkBusy] = useState<boolean>(false);

  // Modals
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState<boolean>(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.processStatus) setProcessStatus(data.processStatus);
        if (data?.targetConfig) setTargetConfig(data.targetConfig);
      })
      .catch(() => {});
  }, []);

  const inMemoryAudit = useMemo(() => {
    void runCounter;
    return runAuditSuite(registry, mitigationConfig, auditMode, 0, 10);
  }, [registry, mitigationConfig, auditMode, runCounter]);

  const inMemoryComparison = useMemo(() => {
    void runCounter;
    return compareMitigationRuns(registry, mitigationConfig);
  }, [registry, mitigationConfig, runCounter]);

  const currentAudit =
    targetConfig.mode !== 'builtin_simulator' && liveAuditResult
      ? liveAuditResult
      : inMemoryAudit;

  const mitigationComparison =
    targetConfig.mode !== 'builtin_simulator' && liveComparisonResult
      ? liveComparisonResult
      : inMemoryComparison;

  const ablationRows = useMemo(() => {
    void runCounter;
    return runAllAblations(registry);
  }, [registry, runCounter]);

  const executeLiveProxyAudit = async (
    cfg: TargetConnectionConfig,
    mit: MitigationConfig,
    mode: AuditMode
  ) => {
    setIsNetworkBusy(true);
    try {
      const res = await fetch('/api/target/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'audit',
          targetConfig: cfg,
          mitigationConfig: mit,
          mode,
        }),
      });
      const data = await res.json();
      if (data.processStatus) setProcessStatus(data.processStatus);
      if (res.ok && data.auditResult && data.comparison) {
        setLiveAuditResult(data.auditResult);
        setLiveComparisonResult(data.comparison);
      }
    } catch {
      // Fallback to in-memory if network request fails
    } finally {
      setIsNetworkBusy(false);
    }
  };

  const syncMitigationBackend = async (nextConfig: MitigationConfig) => {
    try {
      const res = await fetch('/api/mitigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.processStatus) setProcessStatus(data.processStatus);
      }
      if (targetConfig.mode !== 'builtin_simulator') {
        await executeLiveProxyAudit(targetConfig, nextConfig, auditMode);
      }
    } catch {
      // ignore offline
    }
  };

  const handleToggleMitigationPolicy = (key: keyof MitigationConfig) => {
    setMitigationConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      syncMitigationBackend(next);
      return next;
    });
  };

  const handleApplyAllMitigations = () => {
    const next = structuredClone(FULL_MITIGATION_CONFIG);
    setMitigationConfig(next);
    syncMitigationBackend(next);
  };

  const handleResetBaseline = () => {
    const next = structuredClone(BASELINE_MITIGATION_CONFIG);
    setMitigationConfig(next);
    syncMitigationBackend(next);
  };

  const handleUpdateRegistry = (nextRegistry: ProtectedRegistry) => {
    setRegistry(nextRegistry);
    fetch('/api/registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registry: nextRegistry }),
    }).catch(() => {});
  };

  const handleResetRegistry = () => {
    const next = structuredClone(DEFAULT_PROTECTED_REGISTRY);
    setRegistry(next);
    fetch('/api/registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    }).catch(() => {});
  };

  const handleStartLocalProcess = async (port: number) => {
    setIsNetworkBusy(true);
    try {
      const res = await fetch('/api/process/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', port }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.processStatus) setProcessStatus(data.processStatus);
        if (data.targetConfig) {
          setTargetConfig(data.targetConfig);
          await handleTestHandshake(data.targetConfig);
          await executeLiveProxyAudit(data.targetConfig, mitigationConfig, auditMode);
        }
      }
    } finally {
      setIsNetworkBusy(false);
    }
  };

  const handleStopLocalProcess = async () => {
    setIsNetworkBusy(true);
    try {
      const res = await fetch('/api/process/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.processStatus) setProcessStatus(data.processStatus);
        if (data.targetConfig) setTargetConfig(data.targetConfig);
        setLiveAuditResult(null);
        setLiveComparisonResult(null);
      }
    } finally {
      setIsNetworkBusy(false);
    }
  };

  const handleTestHandshake = async (configToTest: TargetConnectionConfig) => {
    setIsNetworkBusy(true);
    try {
      const res = await fetch('/api/target/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToTest),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pingResult) setLastPingResult(data.pingResult);
        if (data.processStatus) setProcessStatus(data.processStatus);
      }
    } finally {
      setIsNetworkBusy(false);
    }
  };

  const handleRunLiveAudit = async (configToUse: TargetConnectionConfig) => {
    setTargetConfig(configToUse);
    if (configToUse.mode === 'builtin_simulator') {
      setLiveAuditResult(null);
      setLiveComparisonResult(null);
      setRunCounter((c) => c + 1);
      return;
    }
    await executeLiveProxyAudit(configToUse, mitigationConfig, auditMode);
  };

  const handleRefreshProcessLogs = async () => {
    try {
      const res = await fetch('/api/process/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logs' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.processStatus) setProcessStatus(data.processStatus);
      }
    } catch {
      // ignore
    }
  };

  const handleClearProcessLogs = async () => {
    try {
      const res = await fetch('/api/process/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-logs' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.processStatus) setProcessStatus(data.processStatus);
      }
    } catch {
      // ignore
    }
  };

  const handleSelectAuditMode = (nextMode: AuditMode) => {
    setAuditMode(nextMode);
    if (targetConfig.mode !== 'builtin_simulator') {
      executeLiveProxyAudit(targetConfig, mitigationConfig, nextMode);
    }
  };

  const navItems: Array<{ key: ActiveWorkspaceTab; label: string }> = [
    { key: 'audit', label: 'Audit & Evidence' },
    { key: 'honeypot', label: 'Honeypot & Registry' },
    { key: 'mitigation', label: 'Mitigation & Retest' },
    { key: 'evaluation', label: 'Evaluation & Ablation' },
    { key: 'architecture', label: 'Architecture & CI/CD' },
  ];

  const topBarActionLabel =
    targetConfig.mode === 'builtin_simulator'
      ? 'Connect Target / Process'
      : targetConfig.mode === 'local_process_bridge'
      ? `Target: PID ${processStatus.pid ?? processStatus.port} (Live)`
      : `Target: ${targetConfig.baseUrl}`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('audit');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            DeceptionGuard-OT
          </a>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Primary Workspace Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    isActive
                      ? 'text-slate-900 font-semibold border-slate-900'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsTargetModalOpen(true)}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                targetConfig.mode === 'builtin_simulator'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {topBarActionLabel}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Navigation Strip (visible only below md) */}
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden flex items-center gap-2 overflow-x-auto px-6 py-2.5 border-t border-slate-200 bg-slate-50"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        {activeTab === 'audit' && (
          <AuditEvidenceView
            auditResult={currentAudit}
            activeMode={auditMode}
            mitigationConfig={mitigationConfig}
            registry={registry}
            targetConfig={targetConfig}
            processStatus={processStatus}
            isAuditingNetwork={isNetworkBusy}
            onSelectMode={handleSelectAuditMode}
            onRunAudit={() => handleRunLiveAudit(targetConfig)}
            onNavigateMitigation={() => setActiveTab('mitigation')}
            onOpenTargetModal={() => setIsTargetModalOpen(true)}
            onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
            onRefreshLogs={handleRefreshProcessLogs}
            onClearLogs={handleClearProcessLogs}
            onToggleMitigationPolicy={handleToggleMitigationPolicy}
            onApplyAllMitigations={handleApplyAllMitigations}
            onResetBaseline={handleResetBaseline}
          />
        )}

        {activeTab === 'honeypot' && (
          <HoneypotRegistryView
            registry={registry}
            mitigationConfig={mitigationConfig}
            containmentEvents={currentAudit.containmentEvents}
            targetConfig={targetConfig}
            processStatus={processStatus}
            lastPingResult={lastPingResult}
            isBusy={isNetworkBusy}
            onUpdateRegistry={handleUpdateRegistry}
            onResetRegistry={handleResetRegistry}
            onUpdateTargetConfig={setTargetConfig}
            onStartLocalProcess={handleStartLocalProcess}
            onStopLocalProcess={handleStopLocalProcess}
            onTestHandshake={handleTestHandshake}
            onRunLiveAudit={handleRunLiveAudit}
            onRefreshProcessLogs={handleRefreshProcessLogs}
            onClearProcessLogs={handleClearProcessLogs}
          />
        )}

        {activeTab === 'mitigation' && (
          <MitigationRetestView
            mitigationConfig={mitigationConfig}
            comparison={mitigationComparison}
            onTogglePolicy={handleToggleMitigationPolicy}
            onApplyAllMitigations={handleApplyAllMitigations}
            onResetBaseline={handleResetBaseline}
          />
        )}

        {activeTab === 'evaluation' && (
          <EvaluationAblationView
            registry={registry}
            currentAudit={currentAudit}
            comparison={mitigationComparison}
            ablations={ablationRows}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureCicdView
            registry={registry}
            mitigationConfig={mitigationConfig}
          />
        )}
      </main>

      {/* Target Connection & Live Process Manager Modal */}
      {isTargetModalOpen && (
        <TargetConnectionManager
          targetConfig={targetConfig}
          processStatus={processStatus}
          lastPingResult={lastPingResult}
          isBusy={isNetworkBusy}
          onUpdateTargetConfig={setTargetConfig}
          onStartLocalProcess={handleStartLocalProcess}
          onStopLocalProcess={handleStopLocalProcess}
          onTestHandshake={handleTestHandshake}
          onRunLiveAudit={handleRunLiveAudit}
          onRefreshProcessLogs={handleRefreshProcessLogs}
          onClearProcessLogs={handleClearProcessLogs}
          isModal={true}
          onClose={() => setIsTargetModalOpen(false)}
        />
      )}

      {/* Software Download & Desktop Install Modal */}
      {isDownloadModalOpen && (
        <SoftwareDownloadCenter
          registry={registry}
          mitigationConfig={mitigationConfig}
          isModal={true}
          onClose={() => setIsDownloadModalOpen(false)}
        />
      )}

      {/* Offline Mode Indicator (PWA) */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"
        >
          Offline Mode — Running from local service-worker cache
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            DeceptionGuard-OT v2.4.0 · Automated Discovery and Verification of Information-Leakage
            Paths in Digital-Twin Industrial Honeypots
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsTargetModalOpen(true)}
              className="text-slate-700 hover:text-slate-900 underline cursor-pointer"
            >
              Connect Target / Process
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setIsDownloadModalOpen(true)}
              className="text-slate-700 hover:text-slate-900 underline cursor-pointer"
            >
              Download Standalone CLI & Docker Bundle
            </button>
            <span aria-hidden="true">·</span>
            <a
              href="/assets/aistudio/DeceptionGuard_OT_Complete_Project_Documentation_eea79c85.pdf"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-slate-900 underline"
            >
              Project Specification PDF
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
