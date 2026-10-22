import {
  AuditRunResult,
  MitigationConfig,
  ProtectedRegistry,
  SequenceExecutionRecord,
} from './types';
import { INITIAL_OT_DEVICES } from './simulator';

export type VisualSceneMode = 'plant_floor' | 'purdue_stack' | 'force_graph';

export type ThermalShaderMode =
  | 'standard_pbr'
  | 'xray_wireframe'
  | 'blast_radius_glow'
  | 'traffic_density';

export type CameraBookmarkId =
  | 'isometric_plant'
  | 'purdue_stack'
  | 'top_down_blueprint'
  | 'first_person_device';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface PurdueLevelSpec {
  levelId: 'L0' | 'L1' | 'L2' | 'L3' | 'L3_5';
  code: string;
  title: string;
  subnet: string;
  elevationY: number;
  colorHex: string;
  description: string;
}

export const PURDUE_LEVEL_SPECS: PurdueLevelSpec[] = [
  {
    levelId: 'L0',
    code: 'LEVEL 0 · FIELD PROCESS',
    title: 'Physical Actuators, Pumps, Valves & Ultrasonic Sensors',
    subnet: '10.240.0.0/26 (Fieldbus / 4-20mA Loop)',
    elevationY: -5.2,
    colorHex: '#06b6d4',
    description: 'Physical water-treatment impeller pumps (P-101), relief valves (V-302), and basin sensors (T-404).',
  },
  {
    levelId: 'L1',
    code: 'LEVEL 1 · BASIC PLC CONTROL',
    title: 'Programmable Logic Controllers & Safety Interlocks',
    subnet: '10.240.0.64/26 (S7comm / Modbus Ring)',
    elevationY: -1.8,
    colorHex: '#a855f7',
    description: 'Modular PLC rack (C-201) executing closed-loop PID control and commissioning logic.',
  },
  {
    levelId: 'L2',
    code: 'LEVEL 2 · SUPERVISORY & HISTORIAN',
    title: 'Plant Process Historian & SCADA Telemetry Archive',
    subnet: '10.240.0.128/26 (DNP3 / Time-Series Bus)',
    elevationY: 1.6,
    colorHex: '#f59e0b',
    description: 'Server blade rack (HIST-601) storing signed telemetry archives and mirror streams.',
  },
  {
    levelId: 'L3',
    code: 'LEVEL 3 · SITE OPERATIONS & GATEWAY',
    title: 'Industrial Protocol Gateway & Cross-Zone Boundary',
    subnet: '10.240.0.192/27 (OPC-UA / Gateway Segment)',
    elevationY: 5.0,
    colorHex: '#3b82f6',
    description: 'Industrial firewall gateway (GW-500) mediating north-south telemetry and diagnostics.',
  },
  {
    levelId: 'L3_5',
    code: 'LEVEL 3.5 · ISOLATED LAB DMZ (10.240.0.0/24)',
    title: 'DeceptionGuard-OT Sequence Auditor & Egress Forcefield',
    subnet: '10.240.0.224/27 (Containment Enclave)',
    elevationY: 8.4,
    colorHex: '#10b981',
    description: 'Security auditing probe, egress containment dome, and canary verification boundary.',
  },
];

export interface CameraBookmarkSpec {
  id: CameraBookmarkId;
  label: string;
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export const CAMERA_BOOKMARKS: Record<CameraBookmarkId, CameraBookmarkSpec> = {
  isometric_plant: {
    id: 'isometric_plant',
    label: 'Isometric Plant',
    position: { x: 18.5, y: 13.5, z: 20.5 },
    target: { x: 0, y: 0.8, z: 0 },
  },
  purdue_stack: {
    id: 'purdue_stack',
    label: 'Purdue Stack',
    position: { x: 22.0, y: 3.5, z: 22.0 },
    target: { x: 0, y: 1.5, z: 0 },
  },
  top_down_blueprint: {
    id: 'top_down_blueprint',
    label: 'Top-Down Blueprint',
    position: { x: 0.01, y: 29.0, z: 0.01 },
    target: { x: 0, y: 0, z: 0 },
  },
  first_person_device: {
    id: 'first_person_device',
    label: 'First-Person Fly-To',
    position: { x: -4.2, y: 3.4, z: 6.8 },
    target: { x: -8.0, y: 1.2, z: 3.5 },
  },
};

export interface DeviceLiveRegisters {
  rpm: number;
  flowRateLpm: number;
  pressureBar: number;
  tankLevelPct: number;
  valvePositionPct: number;
  temperatureC: number;
  cpuLoadPct: number;
  watchdogMs: number;
  reportedScadaState: 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STANDBY' | 'FAULT_INJECTED';
  physicalActuatorState: 'FLOWING_ACTIVE' | 'VALVE_OPEN_85PCT' | 'NOMINAL_SYNC';
}

export interface Node3DDescriptor {
  id: string;
  name: string;
  kind: 'OT_DEVICE' | 'CANARY_TOKEN' | 'JOIN_TOKEN' | 'AUDITOR_PROBE';
  deviceType?: 'PUMP' | 'PLC' | 'VALVE' | 'SENSOR' | 'GATEWAY' | 'HISTORIAN';
  protocol: 'Modbus-TCP' | 'S7comm' | 'OPC-UA' | 'DNP3' | 'HTTPS-AUDIT';
  purdueLevel: 'L0' | 'L1' | 'L2' | 'L3' | 'L3_5';
  plantPos: Vec3Tuple;
  purduePos: Vec3Tuple;
  forcePos: Vec3Tuple;
  activePos: Vec3Tuple;
  blastRadiusScore: number;
  trafficDensityScore: number;
  vulnerable: boolean;
  hardened: boolean;
  hasStateDesyncAnomaly: boolean;
  desyncDetail: string | null;
  exposedCanaryValue: string | null;
  exposedProhibitedFields: string[];
  joinTokenHandle: string;
  recommendedMitigationKey: keyof MitigationConfig;
  registers: DeviceLiveRegisters;
}

export interface InferenceLaserBridge3D {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  joinToken: string;
  relationshipType: string;
  correlatedSteps: [number, number];
  sequenceId: string;
  activeInCurrentSequence: boolean;
  leaked: boolean;
  hardened: boolean;
  colorHex: string;
  badgeText: string;
}

export interface PacketRay3D {
  stepNumber: number;
  method: 'GET' | 'POST';
  endpoint: string;
  sourceId: string;
  targetId: string;
  protocol: 'Modbus-TCP' | 'S7comm' | 'OPC-UA' | 'DNP3' | 'EGRESS';
  colorHex: string;
  latencyMs: number;
  pulseSpeedMultiplier: number;
  statusCode: number;
  isCurrentDvrStep: boolean;
  payloadSummary: string;
  leakedArtifactInStep: string | null;
}

export interface ContainmentShieldState3D {
  subnetCidr: string;
  domeRadius: number;
  egressActiveInSequence: boolean;
  destinationHost: string;
  destinationPort: number;
  protocol: string;
  verdict: 'IDLE_NOMINAL' | 'BREACHED_UNMITIGATED' | 'DEFLECTED_SHIELD_ACTIVE';
  domeColorHex: string;
  vectorColorHex: string;
}

export interface Scene3DTelemetrySnapshot {
  visualMode: VisualSceneMode;
  selectedCaseId: string;
  activeStepIndex: number;
  totalStepsInCase: number;
  nodes: Node3DDescriptor[];
  inferenceBridges: InferenceLaserBridge3D[];
  packetRays: PacketRay3D[];
  containmentShield: ContainmentShieldState3D;
  purdueLevels: PurdueLevelSpec[];
  activeStepRecord: {
    stepNumber: number;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs: number;
    description: string;
    payloadJson: string;
  } | null;
}

const PLANT_COORDS: Record<string, Vec3Tuple> = {
  'P-101': { x: -8.5, y: 0, z: 3.8 },
  'C-201': { x: -3.2, y: 0, z: -3.6 },
  'V-302': { x: -1.2, y: 0, z: 4.2 },
  'T-404': { x: 6.8, y: 0, z: 3.4 },
  'GW-500': { x: 2.8, y: 0, z: -4.2 },
  'HIST-601': { x: 8.6, y: 0, z: -3.4 },
  'AUDITOR-PROBE': { x: 0.0, y: 7.2, z: 9.2 },
};

const PURDUE_COORDS: Record<string, Vec3Tuple> = {
  'P-101': { x: -7.2, y: -5.2, z: 2.2 },
  'V-302': { x: 0.0, y: -5.2, z: 2.8 },
  'T-404': { x: 7.2, y: -5.2, z: 2.2 },
  'C-201': { x: -3.5, y: -1.8, z: 0.0 },
  'HIST-601': { x: 4.0, y: 1.6, z: -0.5 },
  'GW-500': { x: 0.0, y: 5.0, z: 0.0 },
  'AUDITOR-PROBE': { x: 0.0, y: 8.4, z: 2.5 },
};

const FORCE_GRAPH_COORDS: Record<string, Vec3Tuple> = {
  'P-101': { x: -8.0, y: -2.2, z: 4.2 },
  'C-201': { x: -4.2, y: 2.8, z: -2.4 },
  'V-302': { x: -1.0, y: -3.4, z: 4.8 },
  'GW-500': { x: 2.2, y: 3.6, z: -2.8 },
  'T-404': { x: 7.4, y: -2.0, z: 3.8 },
  'HIST-601': { x: 7.8, y: 2.6, z: -2.6 },
  'AUDITOR-PROBE': { x: 0.0, y: 6.8, z: 6.2 },
};

export function resolveEndpointDeviceId(endpoint: string, params?: Record<string, string | number>): string {
  if (endpoint.includes('P-101') || params?.device_id === 'P-101') return 'P-101';
  if (endpoint.includes('C-201') || params?.device_id === 'C-201') return 'C-201';
  if (endpoint.includes('V-302') || params?.device_id === 'V-302') return 'V-302';
  if (endpoint.includes('T-404') || params?.device_id === 'T-404') return 'T-404';
  if (endpoint.includes('GW-500') || params?.device_id === 'GW-500') return 'GW-500';
  if (endpoint.includes('HIST-601') || params?.device_id === 'HIST-601') return 'HIST-601';
  if (endpoint === '/ot/error-probe') return 'C-201';
  if (endpoint === '/ot/egress-check') return 'GW-500';
  return 'GW-500';
}

export function protocolColorHex(protocol: string): string {
  switch (protocol) {
    case 'Modbus-TCP':
      return '#06b6d4'; // Cyan
    case 'S7comm':
      return '#a855f7'; // Violet
    case 'OPC-UA':
      return '#3b82f6'; // Electric Blue
    case 'DNP3':
      return '#f59e0b'; // Amber
    case 'EGRESS':
      return '#ef4444'; // Crimson
    default:
      return '#10b981';
  }
}

export function getCoordinatesForMode(nodeId: string, mode: VisualSceneMode): Vec3Tuple {
  const table =
    mode === 'purdue_stack'
      ? PURDUE_COORDS
      : mode === 'force_graph'
      ? FORCE_GRAPH_COORDS
      : PLANT_COORDS;
  return table[nodeId] ?? { x: 0, y: 0, z: 0 };
}

export function buildSceneTelemetrySnapshot(
  auditResult: AuditRunResult,
  mitigationConfig: MitigationConfig,
  registry: ProtectedRegistry,
  selectedCaseId: string,
  activeStepIndex: number,
  visualMode: VisualSceneMode,
  faultInjectedDeviceIds: string[] = []
): Scene3DTelemetrySnapshot {
  const seqRecord: SequenceExecutionRecord =
    auditResult.records.find((r) => r.testCase.id === selectedCaseId) ??
    auditResult.records[0];

  const totalSteps = seqRecord ? seqRecord.testCase.steps.length : 1;
  const clampedStepIdx = Math.max(0, Math.min(activeStepIndex, totalSteps - 1));

  // Count how many times each device is touched across the 20 sequences for traffic density shader
  const deviceTouchCounts: Record<string, number> = {
    'P-101': 0,
    'C-201': 0,
    'V-302': 0,
    'T-404': 0,
    'GW-500': 0,
    'HIST-601': 0,
  };
  for (const rec of auditResult.records) {
    for (const st of rec.testCase.steps) {
      const devId = resolveEndpointDeviceId(st.endpoint, st.params);
      deviceTouchCounts[devId] = (deviceTouchCounts[devId] ?? 0) + 1;
    }
  }

  // Determine if current sequence or global audit has state desyncs
  const p101DesyncActive =
    !mitigationConfig.enforceStateConsistency &&
    (selectedCaseId === 'TC-L07' || faultInjectedDeviceIds.includes('P-101'));
  const v302DesyncActive =
    !mitigationConfig.enforceStateConsistency &&
    (selectedCaseId === 'TC-L08' || faultInjectedDeviceIds.includes('V-302'));

  // Build 6 OT Device nodes
  const nodes: Node3DDescriptor[] = INITIAL_OT_DEVICES.map((dev) => {
    const purdueLevel: Node3DDescriptor['purdueLevel'] =
      dev.id === 'P-101' || dev.id === 'V-302' || dev.id === 'T-404'
        ? 'L0'
        : dev.id === 'C-201'
        ? 'L1'
        : dev.id === 'HIST-601'
        ? 'L2'
        : 'L3';

    const isFaultInjected = faultInjectedDeviceIds.includes(dev.id);

    // Check if device has unmitigated vulnerabilities
    let vulnerable = false;
    let exposedCanaryValue: string | null = null;
    const exposedProhibitedFields: string[] = [];
    let recommendedMitigationKey: keyof MitigationConfig = 'redactCanaryTokens';

    if (dev.id === 'C-201') {
      recommendedMitigationKey = 'redactCanaryTokens';
      if (!mitigationConfig.redactCanaryTokens) {
        vulnerable = true;
        exposedCanaryValue = 'TEST-SECRET-42';
      }
      if (!mitigationConfig.normalizeErrorMessages) {
        vulnerable = true;
        exposedProhibitedFields.push('debug_stack_trace', 'honeypot_template_id');
      }
    } else if (dev.id === 'P-101') {
      recommendedMitigationKey = 'enforceStateConsistency';
      if (!mitigationConfig.stripProhibitedFields) {
        vulnerable = true;
        exposedProhibitedFields.push('internal_subnet', 'honeypot_template_id');
      }
      if (!mitigationConfig.enforceStateConsistency || !mitigationConfig.unlinkRelationshipJoinKeys) {
        vulnerable = true;
      }
    } else if (dev.id === 'V-302') {
      recommendedMitigationKey = 'stripProhibitedFields';
      if (!mitigationConfig.stripProhibitedFields) {
        vulnerable = true;
        exposedProhibitedFields.push('shadow_plc_mapping');
      }
      if (!mitigationConfig.enforceStateConsistency || !mitigationConfig.unlinkRelationshipJoinKeys) {
        vulnerable = true;
      }
    } else if (dev.id === 'T-404') {
      recommendedMitigationKey = 'unlinkRelationshipJoinKeys';
      if (!mitigationConfig.unlinkRelationshipJoinKeys) {
        vulnerable = true;
      }
    } else if (dev.id === 'GW-500') {
      recommendedMitigationKey = 'enforceStrictEgressAllowlist';
      if (!mitigationConfig.redactCanaryTokens) {
        vulnerable = true;
        exposedCanaryValue = 'OT-CANARY-991-AUTH';
      }
      if (!mitigationConfig.enforceStrictEgressAllowlist) {
        vulnerable = true;
      }
    } else if (dev.id === 'HIST-601') {
      recommendedMitigationKey = 'redactCanaryTokens';
      if (!mitigationConfig.redactCanaryTokens) {
        vulnerable = true;
        exposedCanaryValue = 'HIST-MASTER-KEY-08';
      }
      if (!mitigationConfig.unlinkRelationshipJoinKeys) {
        vulnerable = true;
      }
    }

    if (isFaultInjected) {
      vulnerable = true;
    }

    const hasStateDesyncAnomaly =
      (dev.id === 'P-101' && p101DesyncActive) || (dev.id === 'V-302' && v302DesyncActive);

    const desyncDetail =
      dev.id === 'P-101' && p101DesyncActive
        ? 'DESYNC ANOMALY: SCADA reports IDLE (0 RPM) while physical pipe flow is 420.5 L/min @ 5.8 bar'
        : dev.id === 'V-302' && v302DesyncActive
        ? 'DESYNC ANOMALY: SCADA reports MAINTENANCE (Closed) while physical actuator is 85% open @ 6.4 bar'
        : null;

    const baseBlast =
      dev.id === 'C-201'
        ? 94
        : dev.id === 'GW-500'
        ? 91
        : dev.id === 'P-101'
        ? 86
        : dev.id === 'HIST-601'
        ? 82
        : dev.id === 'V-302'
        ? 79
        : 72;

    const blastRadiusScore = vulnerable ? baseBlast : Math.max(12, Math.round(baseBlast * 0.18));
    const trafficDensityScore = Math.min(100, Math.round(((deviceTouchCounts[dev.id] ?? 4) / 14) * 100));

    const reportedScadaState: DeviceLiveRegisters['reportedScadaState'] = isFaultInjected
      ? 'FAULT_INJECTED'
      : dev.id === 'P-101' && selectedCaseId === 'TC-L07'
      ? 'IDLE'
      : dev.id === 'V-302' && selectedCaseId === 'TC-L08'
      ? 'MAINTENANCE'
      : dev.state;

    const flowRateLpm =
      dev.id === 'P-101'
        ? reportedScadaState === 'IDLE' && mitigationConfig.enforceStateConsistency
          ? 0.0
          : 420.5
        : 0;

    const valvePositionPct =
      dev.id === 'V-302'
        ? reportedScadaState === 'MAINTENANCE'
          ? mitigationConfig.enforceStateConsistency
            ? 0.0
            : 85.0
          : 12.0
        : 0;

    const rpm =
      dev.id === 'P-101'
        ? flowRateLpm > 0
          ? 1780
          : 0
        : dev.id === 'T-404'
        ? 14
        : 0;

    return {
      id: dev.id,
      name: dev.name,
      kind: 'OT_DEVICE',
      deviceType: dev.type,
      protocol: dev.protocol,
      purdueLevel,
      plantPos: PLANT_COORDS[dev.id],
      purduePos: PURDUE_COORDS[dev.id],
      forcePos: FORCE_GRAPH_COORDS[dev.id],
      activePos: getCoordinatesForMode(dev.id, visualMode),
      blastRadiusScore,
      trafficDensityScore,
      vulnerable,
      hardened: !vulnerable,
      hasStateDesyncAnomaly,
      desyncDetail,
      exposedCanaryValue,
      exposedProhibitedFields,
      joinTokenHandle: mitigationConfig.unlinkRelationshipJoinKeys
        ? `OPAQUE-${dev.id}-MASKED`
        : dev.internalLoopRef,
      recommendedMitigationKey,
      registers: {
        rpm,
        flowRateLpm,
        pressureBar: dev.metrics.pressureBar ?? 1.0,
        tankLevelPct: dev.metrics.tankLevelPct ?? 0,
        valvePositionPct,
        temperatureC: isFaultInjected ? (dev.metrics.temperatureC ?? 35) + 18.4 : dev.metrics.temperatureC ?? 35,
        cpuLoadPct: isFaultInjected ? 96 : dev.metrics.cpuLoadPct ?? 20,
        watchdogMs: 2000,
        reportedScadaState,
        physicalActuatorState:
          dev.id === 'P-101' && p101DesyncActive
            ? 'FLOWING_ACTIVE'
            : dev.id === 'V-302' && v302DesyncActive
            ? 'VALVE_OPEN_85PCT'
            : 'NOMINAL_SYNC',
      },
    };
  });

  // 3D Cross-Endpoint Inference Bridges (TC-L02, TC-L04, TC-L06)
  const unlinked = mitigationConfig.unlinkRelationshipJoinKeys;
  const inferenceBridges: InferenceLaserBridge3D[] = [
    {
      id: 'BRIDGE-REL-01',
      sourceDeviceId: 'P-101',
      targetDeviceId: 'C-201',
      joinToken: unlinked ? 'OPAQUE-MASKED' : 'LOOP-REF-884',
      relationshipType: 'CLOSED_LOOP_ACTUATION',
      correlatedSteps: [2, 3],
      sequenceId: 'TC-L02',
      activeInCurrentSequence: selectedCaseId === 'TC-L02',
      leaked: !unlinked,
      hardened: unlinked,
      colorHex: unlinked ? '#10b981' : selectedCaseId === 'TC-L02' ? '#ef4444' : '#f59e0b',
      badgeText: unlinked
        ? 'P-101 ↔ C-201 · UNLINKED (OPAQUE SALT)'
        : 'LEAKED JOIN TOKEN: LOOP-REF-884 (Steps 2 ↔ 3)',
    },
    {
      id: 'BRIDGE-REL-02',
      sourceDeviceId: 'V-302',
      targetDeviceId: 'GW-500',
      joinToken: unlinked ? 'OPAQUE-MASKED' : 'BUS-FAILSAFE-19',
      relationshipType: 'FAILSAFE_INTERLOCK_BUS',
      correlatedSteps: [1, 2],
      sequenceId: 'TC-L04',
      activeInCurrentSequence: selectedCaseId === 'TC-L04',
      leaked: !unlinked,
      hardened: unlinked,
      colorHex: unlinked ? '#10b981' : selectedCaseId === 'TC-L04' ? '#ef4444' : '#f59e0b',
      badgeText: unlinked
        ? 'V-302 ↔ GW-500 · UNLINKED (OPAQUE SALT)'
        : 'LEAKED JOIN TOKEN: BUS-FAILSAFE-19 (Steps 1 ↔ 2)',
    },
    {
      id: 'BRIDGE-REL-03',
      sourceDeviceId: 'T-404',
      targetDeviceId: 'HIST-601',
      joinToken: unlinked ? 'OPAQUE-MASKED' : 'MIRROR-STREAM-77',
      relationshipType: 'HISTORIAN_TELEMETRY_MIRROR',
      correlatedSteps: [1, 2],
      sequenceId: 'TC-L06',
      activeInCurrentSequence: selectedCaseId === 'TC-L06',
      leaked: !unlinked,
      hardened: unlinked,
      colorHex: unlinked ? '#10b981' : selectedCaseId === 'TC-L06' ? '#ef4444' : '#f59e0b',
      badgeText: unlinked
        ? 'T-404 ↔ HIST-601 · UNLINKED (OPAQUE SALT)'
        : 'LEAKED JOIN TOKEN: MIRROR-STREAM-77 (Steps 1 ↔ 2)',
    },
  ];

  // Build Packet Rays for the selected sequence
  const packetRays: PacketRay3D[] = (seqRecord?.testCase.steps ?? []).map((step, idx) => {
    const resp = seqRecord?.responses[idx];
    const targetDeviceId = resolveEndpointDeviceId(step.endpoint, step.params);
    const devNode = nodes.find((n) => n.id === targetDeviceId);
    const protocol: PacketRay3D['protocol'] =
      step.endpoint === '/ot/egress-check'
        ? 'EGRESS'
        : (devNode?.protocol as PacketRay3D['protocol']) ?? 'Modbus-TCP';

    const latencyMs = resp?.latencyMs ?? 6;
    // Faster pulse speed for lower latency, bounded cleanly for 60fps animation
    const pulseSpeedMultiplier = Math.max(0.6, Math.min(2.8, 12 / Math.max(3, latencyMs)));

    let leakedArtifactInStep: string | null = null;
    if (resp) {
      for (const canary of registry.syntheticSecrets) {
        if (resp.rawText.includes(canary.tokenValue)) {
          leakedArtifactInStep = `CANARY LEAK: ${canary.tokenValue}`;
          break;
        }
      }
      if (!leakedArtifactInStep) {
        for (const field of registry.prohibitedFields) {
          if (Object.prototype.hasOwnProperty.call(resp.payload, field.fieldName)) {
            leakedArtifactInStep = `PROHIBITED FIELD: ${field.fieldName}`;
            break;
          }
        }
      }
    }

    return {
      stepNumber: step.stepNumber,
      method: step.method,
      endpoint: step.endpoint,
      sourceId:
        idx === 0
          ? 'AUDITOR-PROBE'
          : resolveEndpointDeviceId(
              seqRecord.testCase.steps[idx - 1].endpoint,
              seqRecord.testCase.steps[idx - 1].params
            ),
      targetId: targetDeviceId,
      protocol,
      colorHex: protocolColorHex(protocol),
      latencyMs,
      pulseSpeedMultiplier,
      statusCode: resp?.statusCode ?? 200,
      isCurrentDvrStep: idx === clampedStepIdx,
      payloadSummary: resp ? resp.rawText.slice(0, 120) : '{}',
      leakedArtifactInStep,
    };
  });

  // 3D Subnet Containment Forcefield (10.240.0.0/24)
  const isEgressSeq = selectedCaseId === 'TC-L10';
  const containmentEnforced = mitigationConfig.enforceStrictEgressAllowlist;
  const containmentShield: ContainmentShieldState3D = {
    subnetCidr: '10.240.0.0/24',
    domeRadius: 15.5,
    egressActiveInSequence: isEgressSeq,
    destinationHost: isEgressSeq ? '198.51.100.44' : '10.240.0.10',
    destinationPort: isEgressSeq ? 8443 : 502,
    protocol: isEgressSeq ? 'HTTPS-EXFIL' : 'MODBUS',
    verdict: !isEgressSeq
      ? 'IDLE_NOMINAL'
      : containmentEnforced
      ? 'DEFLECTED_SHIELD_ACTIVE'
      : 'BREACHED_UNMITIGATED',
    domeColorHex: !isEgressSeq
      ? '#0ea5e9'
      : containmentEnforced
      ? '#10b981'
      : '#ef4444',
    vectorColorHex: containmentEnforced ? '#10b981' : '#ef4444',
  };

  const activeStepDef = seqRecord?.testCase.steps[clampedStepIdx];
  const activeStepResp = seqRecord?.responses[clampedStepIdx];

  return {
    visualMode,
    selectedCaseId,
    activeStepIndex: clampedStepIdx,
    totalStepsInCase: totalSteps,
    nodes,
    inferenceBridges,
    packetRays,
    containmentShield,
    purdueLevels: PURDUE_LEVEL_SPECS,
    activeStepRecord: activeStepDef
      ? {
          stepNumber: activeStepDef.stepNumber,
          endpoint: activeStepDef.endpoint,
          method: activeStepDef.method,
          statusCode: activeStepResp?.statusCode ?? 200,
          latencyMs: activeStepResp?.latencyMs ?? 5,
          description: activeStepDef.description,
          payloadJson: JSON.stringify(activeStepResp?.payload ?? {}, null, 2),
        }
      : null,
  };
}
