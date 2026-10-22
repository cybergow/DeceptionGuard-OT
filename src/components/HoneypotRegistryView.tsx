import React, { useState } from 'react';
import {
  EgressEventRecord,
  MitigationConfig,
  OTDevice,
  ProtectedRegistry,
  SeverityLevel,
  SimulatorResponse,
} from '../core/types';
import {
  ManagedProcessStatus,
  PingHandshakeResult,
  TargetConnectionConfig,
} from '../core/targetTypes';
import { createInitialSessionState, INITIAL_OT_DEVICES, simulateStep } from '../core/simulator';
import { TargetConnectionManager } from './TargetConnectionManager';

interface HoneypotRegistryViewProps {
  registry: ProtectedRegistry;
  mitigationConfig: MitigationConfig;
  containmentEvents: EgressEventRecord[];
  targetConfig: TargetConnectionConfig;
  processStatus: ManagedProcessStatus;
  lastPingResult: PingHandshakeResult | null;
  isBusy: boolean;
  onUpdateRegistry: (nextRegistry: ProtectedRegistry) => void;
  onResetRegistry: () => void;
  onUpdateTargetConfig: (next: TargetConnectionConfig) => void;
  onStartLocalProcess: (port: number) => Promise<void>;
  onStopLocalProcess: () => Promise<void>;
  onTestHandshake: (configToTest: TargetConnectionConfig) => Promise<void>;
  onRunLiveAudit: (configToUse: TargetConnectionConfig) => Promise<void>;
  onRefreshProcessLogs: () => Promise<void>;
  onClearProcessLogs: () => Promise<void>;
}

const PROBE_PRESETS: Array<{
  label: string;
  method: 'GET' | 'POST';
  endpoint: string;
  params: Record<string, string | number>;
}> = [
  {
    label: '1. Station Device List (/ot/devices)',
    method: 'GET',
    endpoint: '/ot/devices',
    params: {},
  },
  {
    label: '2. PLC C-201 Commissioning Config (Seeded Canary)',
    method: 'GET',
    endpoint: '/ot/config/C-201',
    params: { profile: 'commissioning' },
  },
  {
    label: '3. Pump P-101 Internal Descriptor (Prohibited Fields)',
    method: 'GET',
    endpoint: '/ot/device/P-101',
    params: { include_internal: 'true' },
  },
  {
    label: '4. Malformed Register Probe (/ot/error-probe)',
    method: 'GET',
    endpoint: '/ot/error-probe',
    params: { register_offset: 65535 },
  },
  {
    label: '5. Unauthorized External Egress Probe (198.51.100.44:443)',
    method: 'POST',
    endpoint: '/ot/egress-check',
    params: { target_host: '198.51.100.44', target_port: 443, protocol: 'HTTP' },
  },
];

export const HoneypotRegistryView: React.FC<HoneypotRegistryViewProps> = ({
  registry,
  mitigationConfig,
  containmentEvents,
  targetConfig,
  processStatus,
  lastPingResult,
  isBusy,
  onUpdateRegistry,
  onResetRegistry,
  onUpdateTargetConfig,
  onStartLocalProcess,
  onStopLocalProcess,
  onTestHandshake,
  onRunLiveAudit,
  onRefreshProcessLogs,
  onClearProcessLogs,
}) => {
  const [devices, setDevices] = useState<OTDevice[]>(INITIAL_OT_DEVICES);
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number>(1);
  const [probeResponse, setProbeResponse] = useState<SimulatorResponse>(() => {
    const s = createInitialSessionState();
    return simulateStep(
      {
        stepNumber: 1,
        method: PROBE_PRESETS[1].method,
        endpoint: PROBE_PRESETS[1].endpoint,
        params: PROBE_PRESETS[1].params,
        description: PROBE_PRESETS[1].label,
      },
      mitigationConfig,
      registry,
      s
    );
  });

  // Add Synthetic Canary Secret Form State
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretToken, setNewSecretToken] = useState('');
  const [newSecretDesc, setNewSecretDesc] = useState('');
  const [newSecretSeverity, setNewSecretSeverity] = useState<SeverityLevel>('HIGH');
  const [formError, setFormError] = useState<string | null>(null);

  const handleRunProbe = async (idx: number) => {
    setSelectedPresetIdx(idx);
    const preset = PROBE_PRESETS[idx];

    if (targetConfig.mode !== 'builtin_simulator') {
      try {
        const res = await fetch('/api/target/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'probe',
            targetConfig,
            mitigationConfig,
            probeRequest: {
              method: preset.method,
              endpoint: preset.endpoint,
              params: preset.params,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.response) {
            setProbeResponse(data.response);
            await onRefreshProcessLogs();
            return;
          }
        }
      } catch {
        // fallback to in-memory simulator if offline
      }
    }

    const session = createInitialSessionState();
    for (const d of devices) {
      session.deviceStates[d.id] = d.state;
    }
    const resp = simulateStep(
      {
        stepNumber: 1,
        method: preset.method,
        endpoint: preset.endpoint,
        params: preset.params,
        description: preset.label,
      },
      mitigationConfig,
      registry,
      session
    );
    setProbeResponse(resp);
  };

  const handleToggleDeviceState = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId) return d;
        const nextState = d.state === 'RUNNING' ? 'IDLE' : 'RUNNING';
        return {
          ...d,
          state: nextState,
          metrics: {
            ...d.metrics,
            flowRateLpm:
              d.id === 'P-101'
                ? nextState === 'IDLE' && mitigationConfig.enforceStateConsistency
                  ? 0.0
                  : 420.5
                : d.metrics.flowRateLpm,
          },
        };
      })
    );
  };

  const handleAddSyntheticSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecretName.trim() || !newSecretToken.trim()) {
      setFormError('Both Canary Name and Synthetic Token Value are required.');
      return;
    }
    setFormError(null);

    const nextId = `SEC-0${registry.syntheticSecrets.length + 1}`;
    const updated: ProtectedRegistry = {
      ...registry,
      syntheticSecrets: [
        ...registry.syntheticSecrets,
        {
          id: nextId,
          name: newSecretName.trim(),
          tokenValue: newSecretToken.trim(),
          description:
            newSecretDesc.trim() || 'User-defined synthetic canary secret for honeypot auditing.',
          severity: newSecretSeverity,
        },
      ],
    };
    onUpdateRegistry(updated);
    setNewSecretName('');
    setNewSecretToken('');
    setNewSecretDesc('');
  };

  return (
    <div className="space-y-8">
      {/* Embedded Target Connection & Live Process Manager */}
      <TargetConnectionManager
        targetConfig={targetConfig}
        processStatus={processStatus}
        lastPingResult={lastPingResult}
        isBusy={isBusy}
        onUpdateTargetConfig={onUpdateTargetConfig}
        onStartLocalProcess={onStartLocalProcess}
        onStopLocalProcess={onStopLocalProcess}
        onTestHandshake={onTestHandshake}
        onRunLiveAudit={onRunLiveAudit}
        onRefreshProcessLogs={onRefreshProcessLogs}
        onClearProcessLogs={onClearProcessLogs}
        isModal={false}
      />

      {/* Module 1: Simulated Digital-Twin Honeypot & Protocol Probe */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 font-mono">
              Module 1 — Simulated Industrial Honeypot · {registry.environmentName}
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Digital-Twin OT Device Simulator & Interactive Protocol Probe
            </h1>
            <p className="text-xs text-slate-600 max-w-3xl">
              Imitates 6 fictional water-treatment industrial assets across Modbus-TCP, S7comm,
              OPC-UA, and DNP3. Returns controlled normal responses alongside intentionally seeded
              test flaws to evaluate leakage discovery and state consistency.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600 shrink-0">
            Registry Version: <strong className="text-slate-900">{registry.version}</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Device Inventory Table (7 cols) */}
          <div className="lg:col-span-7 border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900">
                01. Simulated OT Assets ({devices.length} Fictional Devices)
              </h2>
              <span className="text-[11px] font-mono text-slate-500">
                Click state toggle to test state-machine behavior
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3 font-mono">Asset ID</th>
                    <th className="py-2.5 px-3">Device Name & Protocol</th>
                    <th className="py-2.5 px-3">State</th>
                    <th className="py-2.5 px-3 text-right">Process Telemetry</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {devices.map((dev) => (
                    <tr key={dev.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {dev.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{dev.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {dev.type} · {dev.protocol} · {dev.firmwareVersion}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        <span
                          className={
                            dev.state === 'RUNNING'
                              ? 'text-emerald-700'
                              : dev.state === 'IDLE'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          }
                        >
                          {dev.state}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {dev.metrics.flowRateLpm !== undefined
                          ? `${dev.metrics.flowRateLpm} L/min`
                          : dev.metrics.valvePositionPct !== undefined
                          ? `${dev.metrics.valvePositionPct}% Open`
                          : dev.metrics.tankLevelPct !== undefined
                          ? `${dev.metrics.tankLevelPct}% Level`
                          : `CPU ${dev.metrics.cpuLoadPct}% · ${dev.metrics.temperatureC}°C`}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleDeviceState(dev.id)}
                          aria-label={`Toggle state for ${dev.id}`}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Toggle State
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Endpoint Probe (5 cols) */}
          <div className="lg:col-span-5 border border-slate-200 rounded-md p-4 space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">
                02. Interactive Honeypot Request Probe (
                {targetConfig.mode === 'builtin_simulator'
                  ? 'Built-In Simulator'
                  : `Live Proxy: ${targetConfig.baseUrl}`}
                )
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dispatch a request to inspect how current mitigation settings and active target mode
                affect the returned payload.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="probe-preset-select"
                className="block text-xs font-medium text-slate-700"
              >
                Select Test Request Preset
              </label>
              <select
                id="probe-preset-select"
                value={selectedPresetIdx}
                onChange={(e) => handleRunProbe(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 font-medium focus:outline-none focus:border-slate-900"
              >
                {PROBE_PRESETS.map((preset, idx) => (
                  <option key={preset.label} value={idx}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-600 pt-1">
              <span>
                {PROBE_PRESETS[selectedPresetIdx].method}{' '}
                {PROBE_PRESETS[selectedPresetIdx].endpoint}
              </span>
              <span>
                HTTP {probeResponse.statusCode} · {probeResponse.latencyMs} ms
              </span>
            </div>

            <pre className="p-3 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
              {JSON.stringify(probeResponse.payload, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      {/* Module 2: Protected-Information Registry */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs text-slate-500 font-mono">
              Module 2 — Protected-Information Registry (Synthetic Secrets Only)
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Synthetic Canary Tokens, Protected Relationships & Prohibited Fields
            </h2>
          </div>
          <button
            type="button"
            onClick={onResetRegistry}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Default Registry
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Synthetic Secrets */}
          <div className="border border-slate-200 rounded-md p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-900">
              A. Seeded Synthetic Secrets ({registry.syntheticSecrets.length})
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {registry.syntheticSecrets.map((sec) => (
                <div key={sec.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-slate-900">{sec.tokenValue}</span>
                    <span className="text-red-700 font-semibold">{sec.severity}</span>
                  </div>
                  <div className="font-medium text-slate-800">
                    {sec.id} · {sec.name}
                  </div>
                  <p className="text-slate-500 text-[11px]">{sec.description}</p>
                </div>
              ))}
            </div>

            {/* Form to Add Synthetic Canary */}
            <form
              onSubmit={handleAddSyntheticSecret}
              className="pt-3 border-t border-slate-200 space-y-2.5"
            >
              <div className="text-xs font-semibold text-slate-900">
                Register New Synthetic Canary
              </div>
              {formError && (
                <div role="alert" className="text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="canary-name" className="block text-[11px] text-slate-600 mb-1">
                  Canary Rule Name
                </label>
                <input
                  id="canary-name"
                  type="text"
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value)}
                  placeholder="e.g. Backup PLC Auth Seed"
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="canary-token" className="block text-[11px] text-slate-600 mb-1">
                    Synthetic Token Value
                  </label>
                  <input
                    id="canary-token"
                    type="text"
                    value={newSecretToken}
                    onChange={(e) => setNewSecretToken(e.target.value)}
                    placeholder="e.g. CANARY-OT-77"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="canary-severity"
                    className="block text-[11px] text-slate-600 mb-1"
                  >
                    Severity
                  </label>
                  <select
                    id="canary-severity"
                    value={newSecretSeverity}
                    onChange={(e) => setNewSecretSeverity(e.target.value as SeverityLevel)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                Add Synthetic Canary
              </button>
            </form>
          </div>

          {/* Protected Device Relationships */}
          <div className="border border-slate-200 rounded-md p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-900">
              B. Protected Topology Relationships ({registry.protectedRelationships.length})
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {registry.protectedRelationships.map((rel) => (
                <div key={rel.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-slate-900">
                      {rel.sourceDevice} ↔ {rel.targetDevice}
                    </span>
                    <span className="text-amber-700 font-semibold">{rel.severity}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600">
                    {rel.id} · {rel.relationshipType} · Shared Key: {rel.sharedJoinKey}
                  </div>
                  <p className="text-slate-500 text-[11px]">{rel.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Prohibited Response Fields */}
          <div className="border border-slate-200 rounded-md p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-900">
              C. Prohibited Response Fields ({registry.prohibitedFields.length})
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {registry.prohibitedFields.map((fld) => (
                <div key={fld.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-slate-900">{fld.fieldName}</span>
                    <span className="text-red-700 font-semibold">{fld.severity}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">Rule ID: {fld.id}</div>
                  <p className="text-slate-600 text-[11px]">{fld.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Module 6: Containment Monitor & Deny-by-Default Egress Policy */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs text-slate-500 font-mono">
              Module 6 — Network Containment & Egress Monitor
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Isolated Lab Allowlist & Outbound Egress Audit Log
            </h2>
          </div>
          <div className="text-xs font-mono">
            Policy Mode:{' '}
            <strong
              className={
                mitigationConfig.enforceStrictEgressAllowlist
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }
            >
              {mitigationConfig.enforceStrictEgressAllowlist
                ? 'DENY-BY-DEFAULT ENFORCED'
                : 'UNMITIGATED (EXTERNAL EGRESS ALERTING)'}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
              Lab Network Egress Allowlist Rules
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600">
                  <th className="py-2 px-3 font-mono">Destination</th>
                  <th className="py-2 px-3 font-mono">Proto/Port</th>
                  <th className="py-2 px-3">Purpose</th>
                  <th className="py-2 px-3">Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {registry.allowlistRules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                      {rule.cidrOrHost}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600">
                      {rule.protocol}:{rule.port}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{rule.purpose}</td>
                    <td className="py-2 px-3 font-mono font-semibold">
                      {rule.allowed ? (
                        <span className="text-emerald-700">ALLOW</span>
                      ) : (
                        <span className="text-red-700">DENY</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
              Observed Egress Audit Events ({containmentEvents.length})
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600">
                  <th className="py-2 px-3 font-mono">Case ID</th>
                  <th className="py-2 px-3 font-mono">Destination</th>
                  <th className="py-2 px-3 font-mono">Allowlisted</th>
                  <th className="py-2 px-3 font-mono">Containment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {containmentEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                      {ev.testCaseId}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                      {ev.destination}:{ev.port} ({ev.protocol})
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {ev.inAllowlist ? 'YES' : 'NO'}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold">
                      {ev.action === 'ALLOWED' ? (
                        <span className="text-emerald-700">ALLOWED (LAB BUS)</span>
                      ) : ev.action === 'BLOCKED' ? (
                        <span className="text-emerald-700">BLOCKED BY FIREWALL</span>
                      ) : (
                        <span className="text-red-700">UNBLOCKED BREACH</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
