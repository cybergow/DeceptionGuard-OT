import React, { useEffect, useState } from 'react';
import {
  ManagedProcessStatus,
  PingHandshakeResult,
  TargetConnectionConfig,
  TargetExecutionMode,
} from '../core/targetTypes';

interface TargetConnectionManagerProps {
  targetConfig: TargetConnectionConfig;
  processStatus: ManagedProcessStatus;
  lastPingResult: PingHandshakeResult | null;
  isBusy: boolean;
  onUpdateTargetConfig: (next: TargetConnectionConfig) => void;
  onStartLocalProcess: (port: number) => Promise<void>;
  onStopLocalProcess: () => Promise<void>;
  onTestHandshake: (configToTest: TargetConnectionConfig) => Promise<void>;
  onRunLiveAudit: (configToUse: TargetConnectionConfig) => Promise<void>;
  onRefreshProcessLogs: () => Promise<void>;
  onClearProcessLogs: () => Promise<void>;
  isModal?: boolean;
  onClose?: () => void;
}

export const TargetConnectionManager: React.FC<TargetConnectionManagerProps> = ({
  targetConfig,
  processStatus,
  lastPingResult,
  isBusy,
  onUpdateTargetConfig,
  onStartLocalProcess,
  onStopLocalProcess,
  onTestHandshake,
  onRunLiveAudit,
  onRefreshProcessLogs,
  onClearProcessLogs,
  isModal = false,
  onClose,
}) => {
  const [formState, setFormState] = useState<TargetConnectionConfig>(targetConfig);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    setFormState(targetConfig);
  }, [targetConfig]);

  const handleModeSwitch = (mode: TargetExecutionMode) => {
    const next: TargetConnectionConfig = {
      ...formState,
      mode,
      baseUrl:
        mode === 'local_process_bridge'
          ? `http://127.0.0.1:${formState.localProcessPort || 4040}`
          : formState.baseUrl || 'http://127.0.0.1:4040',
    };
    setFormState(next);
    onUpdateTargetConfig(next);
    setUrlError(null);
  };

  const validateAndApply = (): TargetConnectionConfig | null => {
    if (formState.mode !== 'builtin_simulator' && !formState.baseUrl.trim()) {
      setUrlError('Target Base URL is required when connecting to a live server or process.');
      return null;
    }
    setUrlError(null);
    onUpdateTargetConfig(formState);
    return formState;
  };

  const handlePingClick = async () => {
    const valid = validateAndApply();
    if (!valid) return;
    await onTestHandshake(valid);
  };

  const handleRunLiveAuditClick = async () => {
    const valid = validateAndApply();
    if (!valid) return;
    await onRunLiveAudit(valid);
    if (isModal && onClose) {
      onClose();
    }
  };

  const content = (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200">
      {/* Header */}
      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
            <span>Target Connection & Live Process Manager</span>
            <span aria-hidden="true">·</span>
            <span>
              Active Target:{' '}
              <strong className="text-slate-900">
                {formState.mode === 'builtin_simulator'
                  ? 'Built-In In-Memory Digital Twin'
                  : formState.mode === 'local_process_bridge'
                  ? `Local Process Bridge (127.0.0.1:${formState.localProcessPort})`
                  : `Remote HTTP Proxy (${formState.baseUrl})`}
              </strong>
            </span>
            {processStatus.running && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-semibold">
                  DAEMON PID {processStatus.pid} ACTIVE (PORT {processStatus.port})
                </span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Connect Auditor to Live OT Honeypot Server or Local Process
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Switch between the default in-memory digital-twin simulator, a live remote HTTP/REST
            OT honeypot endpoint, or spawn a real standalone OS honeypot daemon process on
            loopback sockets (`127.0.0.1:4040`) to execute all 20 multi-step test sequences over
            real network traffic.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={handlePingClick}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            {isBusy ? 'Testing...' : 'Test Connection / Handshake'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleRunLiveAuditClick}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            {isBusy ? 'Auditing Target...' : 'Run Audit Against Active Target'}
          </button>
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Target Connection Manager"
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* 3 Execution Mode Selector Cards */}
      <div className="p-6 space-y-6">
        <div
          role="group"
          aria-label="Target Execution Mode"
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {(
            [
              {
                mode: 'builtin_simulator' as const,
                tag: 'Default · In-Memory',
                title: '01. Built-in Digital-Twin Simulator',
                desc: 'Executes the 20 test sequences deterministically in memory against the reference 6-device water-treatment model.',
              },
              {
                mode: 'local_process_bridge' as const,
                tag: processStatus.running
                  ? `PID ${processStatus.pid} · Port ${processStatus.port}`
                  : 'OS Child Process · Loopback Socket',
                title: '02. Local Process / Container Bridge',
                desc: 'Spawns a real standalone Node.js honeypot daemon process on 127.0.0.1:4040 and audits it over live TCP loopback sockets.',
              },
              {
                mode: 'remote_http_proxy' as const,
                tag: 'External Lab URL · CORS Proxy',
                title: '03. Live Remote HTTP / OT Server',
                desc: 'Routes multi-step audit sequences through the backend proxy to any authorized lab IP or custom honeypot REST service.',
              },
            ]
          ).map((card) => {
            const active = formState.mode === card.mode;
            return (
              <button
                key={card.mode}
                type="button"
                onClick={() => handleModeSwitch(card.mode)}
                aria-pressed={active}
                className={`p-4 text-left border rounded-lg transition-colors flex flex-col justify-between gap-3 cursor-pointer ${
                  active
                    ? 'border-slate-900 bg-slate-50/90'
                    : 'border-slate-200 bg-white hover:bg-slate-50/40'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-slate-500">{card.tag}</span>
                    <span
                      className={
                        active ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                      }
                    >
                      {active ? 'ACTIVE MODE' : 'SELECT'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{card.title}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mode-Specific Configuration & Process Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Connection Parameters & Local Process Spawner */}
          <div className="lg:col-span-7 border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Target Endpoint & Process Daemon Controls
                </h3>
                <p className="text-xs text-slate-500">
                  Configure loopback process port, remote lab URL, authentication headers, and
                  subnet containment guardrails.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {processStatus.running ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onStopLocalProcess}
                    className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Stop Process (PID {processStatus.pid})
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={async () => {
                      const port = formState.localProcessPort || 4040;
                      const nextCfg: TargetConnectionConfig = {
                        ...formState,
                        mode: 'local_process_bridge',
                        localProcessPort: port,
                        baseUrl: `http://127.0.0.1:${port}`,
                      };
                      setFormState(nextCfg);
                      onUpdateTargetConfig(nextCfg);
                      await onStartLocalProcess(port);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Start Local Honeypot Process (Port {formState.localProcessPort || 4040})
                  </button>
                )}
              </div>
            </div>

            {urlError && (
              <div role="alert" className="text-xs font-medium text-red-700">
                {urlError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor="target-base-url" className="block font-medium text-slate-700 mb-1">
                  Target Server Base URL
                </label>
                <input
                  id="target-base-url"
                  type="text"
                  value={formState.baseUrl}
                  onChange={(e) => {
                    const next = { ...formState, baseUrl: e.target.value };
                    setFormState(next);
                  }}
                  placeholder="http://127.0.0.1:4040"
                  className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="local-process-port"
                  className="block font-medium text-slate-700 mb-1"
                >
                  Local Daemon Port
                </label>
                <input
                  id="local-process-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={formState.localProcessPort}
                  onChange={(e) => {
                    const port = Number(e.target.value) || 4040;
                    setFormState({
                      ...formState,
                      localProcessPort: port,
                      baseUrl:
                        formState.mode === 'local_process_bridge'
                          ? `http://127.0.0.1:${port}`
                          : formState.baseUrl,
                    });
                  }}
                  className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="target-auth-type" className="block font-medium text-slate-700 mb-1">
                  Authentication Scheme
                </label>
                <select
                  id="target-auth-type"
                  value={formState.authType}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      authType: e.target.value as TargetConnectionConfig['authType'],
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                >
                  <option value="none">None (Lab Default)</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">X-OT-API-Key Header</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="target-auth-token"
                  className="block font-medium text-slate-700 mb-1"
                >
                  Auth Token / Key (Optional)
                </label>
                <input
                  id="target-auth-token"
                  type="password"
                  value={formState.authToken}
                  onChange={(e) => setFormState({ ...formState, authToken: e.target.value })}
                  placeholder="Optional lab bearer token"
                  className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="target-timeout" className="block font-medium text-slate-700 mb-1">
                  Socket Timeout (ms)
                </label>
                <input
                  id="target-timeout"
                  type="number"
                  min={500}
                  max={15000}
                  step={500}
                  value={formState.timeoutMs}
                  onChange={(e) =>
                    setFormState({ ...formState, timeoutMs: Number(e.target.value) || 3000 })
                  }
                  className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.enforcePrivateLabSubnet}
                  onChange={(e) =>
                    setFormState({ ...formState, enforcePrivateLabSubnet: e.target.checked })
                  }
                  className="rounded border-slate-300"
                />
                <span>
                  Enforce Section 15 Lab Subnet Guardrail (Allow only 127.0.0.0/8 & RFC1918 private
                  lab IPs)
                </span>
              </label>
              <span className="font-mono text-slate-500">
                {processStatus.running
                  ? `Requests Handled: ${processStatus.requestCount}`
                  : 'Daemon Stopped'}
              </span>
            </div>
          </div>

          {/* Right 5 Cols: Handshake Telemetry & Detected Endpoints */}
          <div className="lg:col-span-5 border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Handshake & Socket Telemetry
              </h3>
              <span className="text-xs font-mono">
                {lastPingResult ? (
                  lastPingResult.reachable ? (
                    <strong className="text-emerald-700">
                      CONNECTED ({lastPingResult.roundTripLatencyMs} ms)
                    </strong>
                  ) : (
                    <strong className="text-red-700">
                      UNREACHABLE (HTTP {lastPingResult.statusCode})
                    </strong>
                  )
                ) : (
                  <span className="text-slate-500">Ready to test</span>
                )}
              </span>
            </div>

            {lastPingResult ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[11px] text-slate-500">Round-Trip Latency</div>
                    <div className="text-base font-bold text-slate-900 tabular-nums">
                      {lastPingResult.roundTripLatencyMs} ms
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[11px] text-slate-500">HTTP Status & Containment</div>
                    <div className="text-base font-bold text-slate-900 tabular-nums">
                      HTTP {lastPingResult.statusCode} ·{' '}
                      {lastPingResult.subnetAllowed ? 'ALLOW' : 'BLOCK'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 font-mono text-[11px] text-slate-600">
                  <div>
                    Banner: <strong className="text-slate-900">{lastPingResult.serviceBanner}</strong>
                  </div>
                  <div>Subnet Check: {lastPingResult.subnetRationale}</div>
                </div>

                {lastPingResult.errorMessage && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                    {lastPingResult.errorMessage}
                  </div>
                )}

                {lastPingResult.detectedEndpoints.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-700">
                      Verified OT Protocol Endpoints ({lastPingResult.detectedEndpoints.length}):
                    </div>
                    <div className="font-mono text-[11px] text-slate-600 bg-slate-50 p-2.5 border border-slate-200 rounded">
                      {lastPingResult.detectedEndpoints.join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-xs text-slate-500 space-y-2">
                <p>
                  Click <strong>Start Local Honeypot Process (Port 4040)</strong> to launch a live
                  OS child process honeypot, then click <strong>Test Connection / Handshake</strong>{' '}
                  to measure socket latency and verify endpoints.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Live Process & Network Stream Console */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
            <div className="font-mono font-semibold text-slate-900">
              Live Process & Network Stream Console ({processStatus.logs.length} Events)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshProcessLogs}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
              >
                Refresh Stream
              </button>
              <button
                type="button"
                onClick={onClearProcessLogs}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded cursor-pointer"
              >
                Clear Console
              </button>
            </div>
          </div>

          <pre className="p-4 bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed max-h-56">
            {processStatus.logs.length === 0
              ? '[CONSOLE READY] Start the local honeypot process or run a live target handshake/audit to view real-time stdout, stderr, and network proxy traffic.'
              : processStatus.logs
                  .map(
                    (entry) =>
                      `${entry.timestamp.slice(11, 23)} [${entry.stream.toUpperCase()}] ${entry.line}`
                  )
                  .join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Target Connection and Live Process Manager"
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div className="max-w-6xl w-full my-4 shadow-xl">{content}</div>
    </div>
  );
};
