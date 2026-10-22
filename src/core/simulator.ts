import {
  MitigationConfig,
  OTDevice,
  ProtectedRegistry,
  SimulatorRequest,
  SimulatorResponse,
} from './types';

export const INITIAL_OT_DEVICES: OTDevice[] = [
  {
    id: 'P-101',
    name: 'Centrifugal Feed Pump P-101',
    type: 'PUMP',
    protocol: 'Modbus-TCP',
    state: 'RUNNING',
    metrics: {
      flowRateLpm: 420.5,
      pressureBar: 5.8,
      temperatureC: 41.2,
      cpuLoadPct: 18,
    },
    internalLoopRef: 'LOOP-REF-884',
    firmwareVersion: 'v4.12.0-OT',
  },
  {
    id: 'C-201',
    name: 'Primary Process PLC C-201',
    type: 'PLC',
    protocol: 'S7comm',
    state: 'RUNNING',
    metrics: {
      temperatureC: 36.4,
      cpuLoadPct: 34,
    },
    internalLoopRef: 'LOOP-REF-884',
    firmwareVersion: 'v3.09.2-S7',
  },
  {
    id: 'V-302',
    name: 'Motorized Relief Valve V-302',
    type: 'VALVE',
    protocol: 'Modbus-TCP',
    state: 'STANDBY',
    metrics: {
      valvePositionPct: 12.0,
      pressureBar: 5.7,
      temperatureC: 29.8,
      cpuLoadPct: 11,
    },
    internalLoopRef: 'BUS-FAILSAFE-19',
    firmwareVersion: 'v2.4.1-VLV',
  },
  {
    id: 'T-404',
    name: 'Clarifier Basin Ultrasonic Sensor T-404',
    type: 'SENSOR',
    protocol: 'OPC-UA',
    state: 'RUNNING',
    metrics: {
      tankLevelPct: 74.6,
      temperatureC: 22.5,
      cpuLoadPct: 9,
    },
    internalLoopRef: 'MIRROR-STREAM-77',
    firmwareVersion: 'v1.8.0-SNS',
  },
  {
    id: 'GW-500',
    name: 'Industrial Protocol Gateway GW-500',
    type: 'GATEWAY',
    protocol: 'OPC-UA',
    state: 'RUNNING',
    metrics: {
      temperatureC: 44.0,
      cpuLoadPct: 52,
    },
    internalLoopRef: 'BUS-FAILSAFE-19',
    firmwareVersion: 'v5.2.9-GW',
  },
  {
    id: 'HIST-601',
    name: 'Plant Process Historian HIST-601',
    type: 'HISTORIAN',
    protocol: 'DNP3',
    state: 'RUNNING',
    metrics: {
      temperatureC: 38.1,
      cpuLoadPct: 61,
    },
    internalLoopRef: 'MIRROR-STREAM-77',
    firmwareVersion: 'v8.1.4-HST',
  },
];

export interface SimulationSessionState {
  deviceStates: Record<string, 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STANDBY'>;
  valvePositions: Record<string, number>;
}

export function createInitialSessionState(): SimulationSessionState {
  const deviceStates: Record<string, 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STANDBY'> = {};
  const valvePositions: Record<string, number> = {};
  for (const dev of INITIAL_OT_DEVICES) {
    deviceStates[dev.id] = dev.state;
    if (dev.metrics.valvePositionPct !== undefined) {
      valvePositions[dev.id] = dev.metrics.valvePositionPct;
    }
  }
  return { deviceStates, valvePositions };
}

function deterministicSaltedRef(deviceId: string, rawRef: string, unlink: boolean): string {
  if (!unlink) return rawRef;
  // When mitigation is enabled, each device masks its external correlation handle with a device-scoped opaque token
  return `OPAQUE-${deviceId}-MASKED`;
}

export function simulateStep(
  req: SimulatorRequest,
  mitigation: MitigationConfig,
  registry: ProtectedRegistry,
  session: SimulationSessionState
): SimulatorResponse {
  const { endpoint, stepNumber, params } = req;
  const baseLatency = 4 + ((stepNumber * 3 + endpoint.length) % 7);
  const mitigationOverhead =
    (mitigation.redactCanaryTokens ? 1 : 0) +
    (mitigation.stripProhibitedFields ? 1 : 0) +
    (mitigation.unlinkRelationshipJoinKeys ? 1 : 0) +
    (mitigation.enforceStateConsistency ? 1 : 0);
  const latencyMs = baseLatency + mitigationOverhead;

  // 1. Device inventory endpoint
  if (endpoint === '/ot/devices') {
    const devices = INITIAL_OT_DEVICES.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      protocol: d.protocol,
      state: session.deviceStates[d.id] ?? d.state,
      firmware: d.firmwareVersion,
    }));
    const payload: Record<string, unknown> = {
      status: 'OK',
      station: 'WT-SECTOR-04',
      device_count: devices.length,
      devices,
    };
    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 2. Device detail endpoint (/ot/device/:id)
  if (endpoint.startsWith('/ot/device/')) {
    const deviceId = endpoint.replace('/ot/device/', '');
    const dev = INITIAL_OT_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      return {
        stepNumber,
        statusCode: 404,
        endpoint,
        latencyMs,
        payload: { error: 'DEVICE_NOT_FOUND', deviceId },
        rawText: JSON.stringify({ error: 'DEVICE_NOT_FOUND', deviceId }),
        validNormalInteraction: false,
      };
    }

    const payload: Record<string, unknown> = {
      status: 'OK',
      device_id: dev.id,
      name: dev.name,
      type: dev.type,
      protocol: dev.protocol,
      operational_state: session.deviceStates[dev.id] ?? dev.state,
      firmware_version: dev.firmwareVersion,
      loop_binding_handle: deterministicSaltedRef(
        dev.id,
        dev.internalLoopRef,
        mitigation.unlinkRelationshipJoinKeys
      ),
    };

    if (params?.include_internal === 'true' && !mitigation.stripProhibitedFields) {
      payload.internal_subnet = '172.28.19.0/24-docker-ot-br0';
      payload.honeypot_template_id = 'deception-twin-wt-v2.4';
    }

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 3. Controller / Gateway Configuration endpoint (/ot/config/:id)
  if (endpoint.startsWith('/ot/config/')) {
    const deviceId = endpoint.replace('/ot/config/', '');
    const dev = INITIAL_OT_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      return {
        stepNumber,
        statusCode: 404,
        endpoint,
        latencyMs,
        payload: { error: 'CONFIG_NOT_FOUND' },
        rawText: JSON.stringify({ error: 'CONFIG_NOT_FOUND' }),
        validNormalInteraction: false,
      };
    }

    const payload: Record<string, unknown> = {
      status: 'OK',
      device_id: dev.id,
      polling_interval_ms: 500,
      watchdog_timeout_ms: 2000,
      assigned_loop_token: deterministicSaltedRef(
        dev.id,
        dev.internalLoopRef,
        mitigation.unlinkRelationshipJoinKeys
      ),
    };

    // Seeded canary leak on C-201 config when unmitigated (Worked Example in PDF Section 10)
    if (deviceId === 'C-201' && params?.profile === 'commissioning') {
      payload.commissioning_auth_token = mitigation.redactCanaryTokens
        ? 'REDACTED-SYNTHETIC-TOKEN'
        : 'TEST-SECRET-42';
    }

    // Seeded canary leak on HIST-601 backup config
    if (deviceId === 'HIST-601' && params?.section === 'archive_signing') {
      payload.archive_signing_key = mitigation.redactCanaryTokens
        ? 'REDACTED-ARCHIVE-KEY'
        : 'HIST-MASTER-KEY-08';
    }

    // Seeded prohibited field on V-302 register map
    if (deviceId === 'V-302' && params?.dump_registers === '1' && !mitigation.stripProhibitedFields) {
      payload.shadow_plc_mapping = 'sim_mem_bank_0x00F4_mock_coil';
    }

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 4. Diagnostics endpoint (/ot/diagnostics/:id)
  if (endpoint.startsWith('/ot/diagnostics/')) {
    const deviceId = endpoint.replace('/ot/diagnostics/', '');
    const dev = INITIAL_OT_DEVICES.find((d) => d.id === deviceId);
    const payload: Record<string, unknown> = {
      status: 'OK',
      device_id: deviceId,
      uptime_seconds: 184920,
      cpu_load_pct: dev?.metrics.cpuLoadPct ?? 20,
      memory_free_kb: 49152,
      bus_channel_ref: deterministicSaltedRef(
        deviceId,
        dev?.internalLoopRef ?? 'BUS-00',
        mitigation.unlinkRelationshipJoinKeys
      ),
    };

    if (deviceId === 'GW-500' && params?.verbose === '1') {
      payload.gateway_session_canary = mitigation.redactCanaryTokens
        ? 'SESSION-TOKEN-MASKED'
        : 'OT-CANARY-991-AUTH';
    }

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 5. State transition endpoint (/ot/state-transition)
  if (endpoint === '/ot/state-transition') {
    const targetDevice = String(params?.device_id ?? 'P-101');
    const nextState = (params?.target_state as 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STANDBY') ?? 'IDLE';
    session.deviceStates[targetDevice] = nextState;
    if (targetDevice === 'V-302' && params?.valve_pct !== undefined) {
      session.valvePositions['V-302'] = Number(params.valve_pct);
    }

    const payload: Record<string, unknown> = {
      status: 'TRANSITION_APPLIED',
      device_id: targetDevice,
      new_state: nextState,
      acknowledged: true,
    };

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 6. Telemetry endpoint (/ot/telemetry/:id)
  if (endpoint.startsWith('/ot/telemetry/')) {
    const deviceId = endpoint.replace('/ot/telemetry/', '');
    const dev = INITIAL_OT_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      return {
        stepNumber,
        statusCode: 404,
        endpoint,
        latencyMs,
        payload: { error: 'TELEMETRY_SOURCE_UNKNOWN' },
        rawText: JSON.stringify({ error: 'TELEMETRY_SOURCE_UNKNOWN' }),
        validNormalInteraction: false,
      };
    }

    const currentState = session.deviceStates[dev.id] ?? dev.state;
    let flowRate = dev.metrics.flowRateLpm;
    let pressure = dev.metrics.pressureBar;
    let valvePos = session.valvePositions[dev.id] ?? dev.metrics.valvePositionPct;

    // Seeded State-Machine Inconsistency flaw:
    // If P-101 was transitioned to IDLE, an unmitigated digital-twin continues returning static 420.5 L/min flow!
    if (dev.id === 'P-101' && currentState === 'IDLE') {
      if (mitigation.enforceStateConsistency) {
        flowRate = 0.0;
        pressure = 1.0;
      } else {
        flowRate = 420.5; // Inconsistent with IDLE state!
        pressure = 5.8;
      }
    }

    // Seeded State-Machine Inconsistency flaw for Valve V-302:
    // If V-302 is in MAINTENANCE (closed lock-out), unmitigated simulator still reports active relief discharge pressure drop
    if (dev.id === 'V-302' && currentState === 'MAINTENANCE') {
      if (mitigation.enforceStateConsistency) {
        valvePos = 0.0;
        pressure = 0.0;
      } else {
        valvePos = 85.0; // Inconsistent with MAINTENANCE lock-out state!
        pressure = 6.4;
      }
    }

    const payload: Record<string, unknown> = {
      status: 'OK',
      device_id: dev.id,
      operational_state: currentState,
      temperature_c: dev.metrics.temperatureC,
      ...(flowRate !== undefined ? { flow_rate_lpm: flowRate } : {}),
      ...(pressure !== undefined ? { pressure_bar: pressure } : {}),
      ...(valvePos !== undefined ? { valve_position_pct: valvePos } : {}),
      ...(dev.metrics.tankLevelPct !== undefined ? { tank_level_pct: dev.metrics.tankLevelPct } : {}),
      stream_tag: deterministicSaltedRef(
        dev.id,
        dev.internalLoopRef,
        mitigation.unlinkRelationshipJoinKeys
      ),
    };

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
    };
  }

  // 7. Malformed protocol / Error probe endpoint (/ot/error-probe)
  if (endpoint === '/ot/error-probe') {
    if (mitigation.normalizeErrorMessages) {
      const normalized = {
        status: 'ERROR',
        modbus_exception_code: '0x02_ILLEGAL_DATA_ADDRESS',
        message: 'Standard Industrial Exception: Requested register block out of range.',
      };
      return {
        stepNumber,
        statusCode: 200,
        endpoint,
        latencyMs,
        payload: normalized,
        rawText: JSON.stringify(normalized),
        validNormalInteraction: true,
      };
    } else {
      const rawError = {
        status: 'ERROR',
        modbus_exception_code: '0x02_ILLEGAL_DATA_ADDRESS',
        debug_stack_trace:
          'Traceback (most recent call last): File "/opt/deceptionguard/honeypot_sim/modbus_twin.py", line 142, in read_holding_registers',
        honeypot_template_id: 'deception-twin-wt-v2.4',
      };
      return {
        stepNumber,
        statusCode: 500,
        endpoint,
        latencyMs,
        payload: rawError,
        rawText: JSON.stringify(rawError),
        validNormalInteraction: true,
      };
    }
  }

  // 8. Network Containment / Egress Check endpoint (/ot/egress-check)
  if (endpoint === '/ot/egress-check') {
    const targetHost = String(params?.target_host ?? '127.0.0.1');
    const targetPort = Number(params?.target_port ?? 502);
    const protocol = String(params?.protocol ?? 'MODBUS');

    const matchedRule = registry.allowlistRules.find(
      (r) => r.cidrOrHost === targetHost && r.port === targetPort
    );
    const isAllowlisted = matchedRule ? matchedRule.allowed : false;
    const blocked = isAllowlisted ? false : mitigation.enforceStrictEgressAllowlist;

    const payload: Record<string, unknown> = {
      status: blocked ? 'CONTAINMENT_BLOCKED' : 'EGRESS_DISPATCHED',
      destination: targetHost,
      port: targetPort,
      protocol,
      allowlisted: isAllowlisted,
      containment_policy: mitigation.enforceStrictEgressAllowlist
        ? 'DENY_BY_DEFAULT_ENFORCED'
        : 'PERMISSIVE_WARNING_ONLY',
    };

    return {
      stepNumber,
      statusCode: 200,
      endpoint,
      latencyMs,
      payload,
      rawText: JSON.stringify(payload),
      validNormalInteraction: true,
      egressAttempt: {
        destination: targetHost,
        port: targetPort,
        protocol,
        blockedByContainment: blocked,
      },
    };
  }

  // 9. Standard Modbus / OPC-UA harmless operational endpoints
  const fallbackPayload: Record<string, unknown> = {
    status: 'OK',
    endpoint,
    params: params ?? {},
    ack: true,
    timestamp_iso: '2026-10-22T15:00:00Z',
  };

  return {
    stepNumber,
    statusCode: 200,
    endpoint,
    latencyMs,
    payload: fallbackPayload,
    rawText: JSON.stringify(fallbackPayload),
    validNormalInteraction: true,
  };
}
