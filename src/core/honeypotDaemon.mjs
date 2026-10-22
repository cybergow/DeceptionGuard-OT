#!/usr/bin/env node
/**
 * DeceptionGuard-OT — Standalone Local Honeypot Daemon Process (honeypotDaemon.mjs)
 * Spawned and managed via /api/process/manage or executed directly in a terminal.
 * Listens on 127.0.0.1:<port> and serves real HTTP/OT endpoints over TCP loopback sockets.
 */

import http from 'node:http';
import { URL } from 'node:url';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx !== -1 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 4040;

let mitigation = {
  redactCanaryTokens: false,
  stripProhibitedFields: false,
  unlinkRelationshipJoinKeys: false,
  enforceStateConsistency: false,
  normalizeErrorMessages: false,
  enforceStrictEgressAllowlist: false,
};

const INITIAL_DEVICES = [
  {
    id: 'P-101',
    name: 'Centrifugal Feed Pump P-101',
    type: 'PUMP',
    protocol: 'Modbus-TCP',
    state: 'RUNNING',
    metrics: { flowRateLpm: 420.5, pressureBar: 5.8, temperatureC: 41.2, cpuLoadPct: 18 },
    internalLoopRef: 'LOOP-REF-884',
    firmwareVersion: 'v4.12.0-OT',
  },
  {
    id: 'C-201',
    name: 'Primary Process PLC C-201',
    type: 'PLC',
    protocol: 'S7comm',
    state: 'RUNNING',
    metrics: { temperatureC: 36.4, cpuLoadPct: 34 },
    internalLoopRef: 'LOOP-REF-884',
    firmwareVersion: 'v3.09.2-S7',
  },
  {
    id: 'V-302',
    name: 'Motorized Relief Valve V-302',
    type: 'VALVE',
    protocol: 'Modbus-TCP',
    state: 'STANDBY',
    metrics: { valvePositionPct: 12.0, pressureBar: 5.7, temperatureC: 29.8, cpuLoadPct: 11 },
    internalLoopRef: 'BUS-FAILSAFE-19',
    firmwareVersion: 'v2.4.1-VLV',
  },
  {
    id: 'T-404',
    name: 'Clarifier Basin Ultrasonic Sensor T-404',
    type: 'SENSOR',
    protocol: 'OPC-UA',
    state: 'RUNNING',
    metrics: { tankLevelPct: 74.6, temperatureC: 22.5, cpuLoadPct: 9 },
    internalLoopRef: 'MIRROR-STREAM-77',
    firmwareVersion: 'v1.8.0-SNS',
  },
  {
    id: 'GW-500',
    name: 'Industrial Protocol Gateway GW-500',
    type: 'GATEWAY',
    protocol: 'OPC-UA',
    state: 'RUNNING',
    metrics: { temperatureC: 44.0, cpuLoadPct: 52 },
    internalLoopRef: 'BUS-FAILSAFE-19',
    firmwareVersion: 'v5.2.9-GW',
  },
  {
    id: 'HIST-601',
    name: 'Plant Process Historian HIST-601',
    type: 'HISTORIAN',
    protocol: 'DNP3',
    state: 'RUNNING',
    metrics: { temperatureC: 38.1, cpuLoadPct: 61 },
    internalLoopRef: 'MIRROR-STREAM-77',
    firmwareVersion: 'v8.1.4-HST',
  },
];

let deviceStates = Object.fromEntries(INITIAL_DEVICES.map((d) => [d.id, d.state]));
let valvePositions = { 'V-302': 12.0 };

function saltedRef(deviceId, rawRef) {
  if (!mitigation.unlinkRelationshipJoinKeys) return rawRef;
  return `OPAQUE-${deviceId}-MASKED`;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-OT-Honeypot-Daemon': `PID-${process.pid}`,
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const t0 = performance.now();
  const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = parsedUrl.pathname;
  const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());
  const bodyParams = req.method === 'POST' ? await parseBody(req) : {};
  const params = { ...queryParams, ...bodyParams };

  if (pathname === '/ot/health' || pathname === '/') {
    const payload = {
      status: 'OK',
      service: 'DeceptionGuard-OT Standalone Honeypot Process Daemon',
      pid: process.pid,
      port: PORT,
      station: 'WT-SECTOR-04-LIVE-DAEMON',
      endpoints: [
        '/ot/devices',
        '/ot/device/:id',
        '/ot/config/:id',
        '/ot/diagnostics/:id',
        '/ot/state-transition',
        '/ot/telemetry/:id',
        '/ot/error-probe',
        '/ot/egress-check',
      ],
      mitigation,
    };
    sendJson(res, 200, payload);
    console.log(`[HONEYPOT-PID-${process.pid}] ${req.method} ${pathname} -> 200 OK (Handshake)`);
    return;
  }

  if (pathname === '/ot/admin/reset-session' && req.method === 'POST') {
    deviceStates = Object.fromEntries(INITIAL_DEVICES.map((d) => [d.id, d.state]));
    valvePositions = { 'V-302': 12.0 };
    if (bodyParams && typeof bodyParams.mitigation === 'object') {
      mitigation = { ...mitigation, ...bodyParams.mitigation };
    }
    sendJson(res, 200, { status: 'SESSION_RESET', mitigation });
    return;
  }

  if (pathname === '/ot/admin/mitigation' && req.method === 'POST') {
    mitigation = { ...mitigation, ...bodyParams };
    console.log(
      `[HONEYPOT-PID-${process.pid}] Updated live daemon mitigation profile: ${JSON.stringify(mitigation)}`
    );
    sendJson(res, 200, { status: 'MITIGATION_UPDATED', mitigation });
    return;
  }

  if (pathname === '/ot/devices') {
    const devices = INITIAL_DEVICES.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      protocol: d.protocol,
      state: deviceStates[d.id] ?? d.state,
      firmware: d.firmwareVersion,
    }));
    sendJson(res, 200, {
      status: 'OK',
      station: 'WT-SECTOR-04',
      device_count: devices.length,
      devices,
    });
  } else if (pathname.startsWith('/ot/device/')) {
    const deviceId = pathname.replace('/ot/device/', '');
    const dev = INITIAL_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      sendJson(res, 404, { error: 'DEVICE_NOT_FOUND', deviceId });
    } else {
      const payload = {
        status: 'OK',
        device_id: dev.id,
        name: dev.name,
        type: dev.type,
        protocol: dev.protocol,
        operational_state: deviceStates[dev.id] ?? dev.state,
        firmware_version: dev.firmwareVersion,
        loop_binding_handle: saltedRef(dev.id, dev.internalLoopRef),
      };
      if (String(params.include_internal) === 'true' && !mitigation.stripProhibitedFields) {
        payload.internal_subnet = '172.28.19.0/24-docker-ot-br0';
        payload.honeypot_template_id = 'deception-twin-wt-v2.4';
      }
      sendJson(res, 200, payload);
    }
  } else if (pathname.startsWith('/ot/config/')) {
    const deviceId = pathname.replace('/ot/config/', '');
    const dev = INITIAL_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      sendJson(res, 404, { error: 'CONFIG_NOT_FOUND' });
    } else {
      const payload = {
        status: 'OK',
        device_id: dev.id,
        polling_interval_ms: 500,
        watchdog_timeout_ms: 2000,
        assigned_loop_token: saltedRef(dev.id, dev.internalLoopRef),
      };
      if (deviceId === 'C-201' && String(params.profile) === 'commissioning') {
        payload.commissioning_auth_token = mitigation.redactCanaryTokens
          ? 'REDACTED-SYNTHETIC-TOKEN'
          : 'TEST-SECRET-42';
      }
      if (deviceId === 'HIST-601' && String(params.section) === 'archive_signing') {
        payload.archive_signing_key = mitigation.redactCanaryTokens
          ? 'REDACTED-ARCHIVE-KEY'
          : 'HIST-MASTER-KEY-08';
      }
      if (deviceId === 'V-302' && String(params.dump_registers) === '1' && !mitigation.stripProhibitedFields) {
        payload.shadow_plc_mapping = 'sim_mem_bank_0x00F4_mock_coil';
      }
      sendJson(res, 200, payload);
    }
  } else if (pathname.startsWith('/ot/diagnostics/')) {
    const deviceId = pathname.replace('/ot/diagnostics/', '');
    const dev = INITIAL_DEVICES.find((d) => d.id === deviceId);
    const payload = {
      status: 'OK',
      device_id: deviceId,
      uptime_seconds: Math.floor(process.uptime()),
      cpu_load_pct: dev?.metrics.cpuLoadPct ?? 20,
      memory_free_kb: 49152,
      bus_channel_ref: saltedRef(deviceId, dev?.internalLoopRef ?? 'BUS-00'),
    };
    if (deviceId === 'GW-500' && String(params.verbose) === '1') {
      payload.gateway_session_canary = mitigation.redactCanaryTokens
        ? 'SESSION-TOKEN-MASKED'
        : 'OT-CANARY-991-AUTH';
    }
    sendJson(res, 200, payload);
  } else if (pathname === '/ot/state-transition') {
    const targetDevice = String(params.device_id ?? 'P-101');
    const nextState = String(params.target_state ?? 'IDLE');
    deviceStates[targetDevice] = nextState;
    if (targetDevice === 'V-302' && params.valve_pct !== undefined) {
      valvePositions['V-302'] = Number(params.valve_pct);
    }
    sendJson(res, 200, {
      status: 'TRANSITION_APPLIED',
      device_id: targetDevice,
      new_state: nextState,
      acknowledged: true,
    });
  } else if (pathname.startsWith('/ot/telemetry/')) {
    const deviceId = pathname.replace('/ot/telemetry/', '');
    const dev = INITIAL_DEVICES.find((d) => d.id === deviceId);
    if (!dev) {
      sendJson(res, 404, { error: 'TELEMETRY_SOURCE_UNKNOWN' });
    } else {
      const currentState = deviceStates[dev.id] ?? dev.state;
      let flowRate = dev.metrics.flowRateLpm;
      let pressure = dev.metrics.pressureBar;
      let valvePos = valvePositions[dev.id] ?? dev.metrics.valvePositionPct;

      if (dev.id === 'P-101' && currentState === 'IDLE') {
        flowRate = mitigation.enforceStateConsistency ? 0.0 : 420.5;
        pressure = mitigation.enforceStateConsistency ? 1.0 : 5.8;
      }
      if (dev.id === 'V-302' && currentState === 'MAINTENANCE') {
        valvePos = mitigation.enforceStateConsistency ? 0.0 : 85.0;
        pressure = mitigation.enforceStateConsistency ? 0.0 : 6.4;
      }

      const payload = {
        status: 'OK',
        device_id: dev.id,
        operational_state: currentState,
        temperature_c: dev.metrics.temperatureC,
        ...(flowRate !== undefined ? { flow_rate_lpm: flowRate } : {}),
        ...(pressure !== undefined ? { pressure_bar: pressure } : {}),
        ...(valvePos !== undefined ? { valve_position_pct: valvePos } : {}),
        ...(dev.metrics.tankLevelPct !== undefined ? { tank_level_pct: dev.metrics.tankLevelPct } : {}),
        stream_tag: saltedRef(dev.id, dev.internalLoopRef),
      };
      sendJson(res, 200, payload);
    }
  } else if (pathname === '/ot/error-probe') {
    if (mitigation.normalizeErrorMessages) {
      sendJson(res, 200, {
        status: 'ERROR',
        modbus_exception_code: '0x02_ILLEGAL_DATA_ADDRESS',
        message: 'Standard Industrial Exception: Requested register block out of range.',
      });
    } else {
      sendJson(res, 500, {
        status: 'ERROR',
        modbus_exception_code: '0x02_ILLEGAL_DATA_ADDRESS',
        debug_stack_trace:
          'Traceback (most recent call last): File "/opt/deceptionguard/honeypot_sim/modbus_twin.py", line 142, in read_holding_registers',
        honeypot_template_id: 'deception-twin-wt-v2.4',
      });
    }
  } else if (pathname === '/ot/egress-check') {
    const targetHost = String(params.target_host ?? '127.0.0.1');
    const targetPort = Number(params.target_port ?? 502);
    const protocol = String(params.protocol ?? 'MODBUS');
    const isAllowlisted =
      (targetHost === '127.0.0.1' && targetPort === 3000) ||
      (targetHost === '10.240.0.10' && targetPort === 502) ||
      (targetHost === '10.240.0.20' && targetPort === 4840);
    const blocked = isAllowlisted ? false : mitigation.enforceStrictEgressAllowlist;

    sendJson(res, 200, {
      status: blocked ? 'CONTAINMENT_BLOCKED' : 'EGRESS_DISPATCHED',
      destination: targetHost,
      port: targetPort,
      protocol,
      allowlisted: isAllowlisted,
      containment_policy: mitigation.enforceStrictEgressAllowlist
        ? 'DENY_BY_DEFAULT_ENFORCED'
        : 'PERMISSIVE_WARNING_ONLY',
      _egressAttempt: {
        destination: targetHost,
        port: targetPort,
        protocol,
        blockedByContainment: blocked,
      },
    });
  } else {
    sendJson(res, 200, {
      status: 'OK',
      endpoint: pathname,
      params,
      ack: true,
    });
  }

  const elapsedMs = (performance.now() - t0).toFixed(2);
  console.log(
    `[HONEYPOT-PID-${process.pid}] ${req.method} ${req.url} -> ${res.statusCode} (${elapsedMs}ms)`
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[HONEYPOT-PID-${process.pid}] Listening on http://127.0.0.1:${PORT} (Isolated OT Digital-Twin Process Ready)`
  );
});
