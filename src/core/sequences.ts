import { TestSequence } from './types';

export const CORE_TEST_SEQUENCES: TestSequence[] = [
  // ============================================================================
  // 10 SEEDED LEAKAGE SCENARIOS (Positive Cases: L01 - L10)
  // ============================================================================
  {
    id: 'TC-L01',
    title: 'PLC C-201 Commissioning Canary Token Exposure',
    category: 'leakage',
    leakageType: 'CANARY_TOKEN',
    requiresMultiStep: false,
    targetFactId: 'SEC-01',
    description:
      'Queries C-201 commissioning configuration profile to test whether synthetic canary TEST-SECRET-42 is exposed in cleartext.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/config/C-201',
        params: { profile: 'commissioning' },
        description: 'Fetch commissioning configuration profile from Primary PLC C-201.',
      },
    ],
  },
  {
    id: 'TC-L02',
    title: 'Pump P-101 to Controller C-201 Multi-Step Relationship Inference',
    category: 'leakage',
    leakageType: 'MULTI_STEP_INFERENCE',
    requiresMultiStep: true,
    targetFactId: 'REL-01',
    description:
      'Worked Example (PDF Section 10): Sends a 3-step sequence (device inventory -> P-101 loop binding -> C-201 config). Neither response alone reveals the P-101 <-> C-201 pairing, but correlating LOOP-REF-884 across steps exposes the protected actuation loop.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/devices',
        description: 'Request active OT station device inventory.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/device/P-101',
        description: 'Inspect Feed Pump P-101 operational metadata and loop binding handle.',
      },
      {
        stepNumber: 3,
        method: 'GET',
        endpoint: '/ot/config/C-201',
        description: 'Retrieve Controller C-201 loop assignment token and correlate with Step 2.',
      },
    ],
  },
  {
    id: 'TC-L03',
    title: 'Internal Docker Bridge & Decoy Template Field Leak',
    category: 'leakage',
    leakageType: 'PROHIBITED_FIELD',
    requiresMultiStep: false,
    targetFactId: 'FLD-01',
    description:
      'Requests verbose internal metadata on Pump P-101 to detect prohibited fields (honeypot_template_id, internal_subnet).',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/device/P-101',
        params: { include_internal: 'true' },
        description: 'Query P-101 descriptor with internal diagnostic flag enabled.',
      },
    ],
  },
  {
    id: 'TC-L04',
    title: 'Valve V-302 to Gateway GW-500 Emergency Override Bus Inference',
    category: 'leakage',
    leakageType: 'MULTI_STEP_INFERENCE',
    requiresMultiStep: true,
    targetFactId: 'REL-02',
    description:
      'Executes a 3-step sequence across V-302 device status and GW-500 diagnostics to infer the hidden FAILSAFE_OVERRIDE_BUS relationship via shared key BUS-FAILSAFE-19.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/devices',
        description: 'Enumerate station devices to locate valve and gateway identifiers.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/device/V-302',
        description: 'Read Relief Valve V-302 descriptor to extract loop_binding_handle.',
      },
      {
        stepNumber: 3,
        method: 'GET',
        endpoint: '/ot/diagnostics/GW-500',
        description: 'Read Gateway GW-500 bus channel reference and correlate failsafe bus key.',
      },
    ],
  },
  {
    id: 'TC-L05',
    title: 'Gateway GW-500 Verbose Diagnostic Canary Leak',
    category: 'leakage',
    leakageType: 'CANARY_TOKEN',
    requiresMultiStep: false,
    targetFactId: 'SEC-02',
    description:
      'Probes Gateway GW-500 diagnostic dump with verbose flag to check for synthetic token OT-CANARY-991-AUTH.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/diagnostics/GW-500',
        params: { verbose: '1' },
        description: 'Request verbose diagnostic buffer from Industrial Gateway GW-500.',
      },
    ],
  },
  {
    id: 'TC-L06',
    title: 'Sensor T-404 to Historian HIST-601 Shadow Mirror Inference',
    category: 'leakage',
    leakageType: 'MULTI_STEP_INFERENCE',
    requiresMultiStep: true,
    targetFactId: 'REL-03',
    description:
      'Correlates stream_tag in T-404 telemetry with assigned_loop_token in HIST-601 config across 2 steps to uncover the hidden shadow telemetry replication link.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/telemetry/T-404',
        description: 'Poll Clarifier Ultrasonic Sensor T-404 telemetry stream metadata.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/config/HIST-601',
        description: 'Inspect Historian HIST-601 ingestion configuration for matching stream token.',
      },
    ],
  },
  {
    id: 'TC-L07',
    title: 'Pump P-101 Stop-State vs Non-Zero Flow Telemetry Desync',
    category: 'leakage',
    leakageType: 'STATE_INCONSISTENCY',
    requiresMultiStep: true,
    targetFactId: 'STATE-P101',
    description:
      'Multi-step state consistency test: transitions Pump P-101 to IDLE in Step 1, then polls telemetry in Step 2. Checks if the honeypot falsely reports 420.5 L/min flow while stopped.',
    steps: [
      {
        stepNumber: 1,
        method: 'POST',
        endpoint: '/ot/state-transition',
        params: { device_id: 'P-101', target_state: 'IDLE' },
        description: 'Issue STOP command to transition Centrifugal Feed Pump P-101 to IDLE.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/telemetry/P-101',
        description: 'Verify whether P-101 flow rate and pressure drop to zero in IDLE state.',
      },
    ],
  },
  {
    id: 'TC-L08',
    title: 'Valve V-302 Maintenance Lockout Telemetry Inconsistency',
    category: 'leakage',
    leakageType: 'STATE_INCONSISTENCY',
    requiresMultiStep: true,
    targetFactId: 'STATE-V302',
    description:
      'Multi-step state machine check: places Relief Valve V-302 into MAINTENANCE lockout and verifies whether subsequent telemetry still reports an 85% open valve aperture.',
    steps: [
      {
        stepNumber: 1,
        method: 'POST',
        endpoint: '/ot/state-transition',
        params: { device_id: 'V-302', target_state: 'MAINTENANCE', valve_pct: 0 },
        description: 'Place Relief Valve V-302 into MAINTENANCE lockout state.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/telemetry/V-302',
        description: 'Poll V-302 telemetry to audit physical state consistency.',
      },
    ],
  },
  {
    id: 'TC-L09',
    title: 'Malformed Modbus Register Exception Stack-Trace Fingerprint',
    category: 'leakage',
    leakageType: 'ERROR_FINGERPRINT',
    requiresMultiStep: false,
    targetFactId: 'FLD-04',
    description:
      'Sends an out-of-range register read probe to verify whether error responses leak Python simulator file paths and honeypot_template_id.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/error-probe',
        params: { register_offset: 65535 },
        description: 'Send boundary register read probe to trigger exception handler.',
      },
    ],
  },
  {
    id: 'TC-L10',
    title: 'Unauthorized Outbound Telemetry Egress & Shadow PLC Mapping',
    category: 'leakage',
    leakageType: 'CONTAINMENT_BREACH',
    requiresMultiStep: true,
    targetFactId: 'ALW-04',
    description:
      'Two-step sequence probing V-302 register dump and attempting outbound webhook egress to non-allowlisted host 198.51.100.44:443.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/config/V-302',
        params: { dump_registers: '1' },
        description: 'Query V-302 configuration register map.',
      },
      {
        stepNumber: 2,
        method: 'POST',
        endpoint: '/ot/egress-check',
        params: { target_host: '198.51.100.44', target_port: 443, protocol: 'HTTP' },
        description: 'Test containment monitor response to unauthorized external IP egress.',
      },
    ],
  },

  // ============================================================================
  // 10 HARMLESS NORMAL INTERACTION SCENARIOS (Negative Cases: H01 - H10)
  // ============================================================================
  {
    id: 'TC-H01',
    title: 'Standard Station Device Discovery Poll',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Ordinary SCADA supervisory poll listing active station devices and firmware versions.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/devices',
        description: 'Retrieve standard station device list.',
      },
    ],
  },
  {
    id: 'TC-H02',
    title: 'Routine Pump P-101 Running Telemetry Read',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Reads normal flow rate, pressure, and temperature from Feed Pump P-101 in RUNNING state.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/telemetry/P-101',
        description: 'Poll P-101 standard process telemetry.',
      },
    ],
  },
  {
    id: 'TC-H03',
    title: 'Clarifier Tank T-404 Ultrasonic Level Check',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Reads basin level percentage and temperature from Sensor T-404.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/telemetry/T-404',
        description: 'Poll T-404 basin level sensor.',
      },
    ],
  },
  {
    id: 'TC-H04',
    title: 'Standard PLC C-201 Watchdog & Polling Interval Read',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Queries non-sensitive timing parameters on Controller C-201 without privileged flags.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/config/C-201',
        description: 'Read standard C-201 polling configuration.',
      },
    ],
  },
  {
    id: 'TC-H05',
    title: 'Gateway GW-500 Non-Verbose Health Check',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Reads CPU load and free memory on Gateway GW-500 using standard health check parameters.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/diagnostics/GW-500',
        description: 'Request standard gateway health metrics.',
      },
    ],
  },
  {
    id: 'TC-H06',
    title: 'Authorized Lab Subnet Modbus Bus Verification',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Verifies allowlisted local lab traffic to 10.240.0.10:502 passes containment monitoring cleanly.',
    steps: [
      {
        stepNumber: 1,
        method: 'POST',
        endpoint: '/ot/egress-check',
        params: { target_host: '10.240.0.10', target_port: 502, protocol: 'MODBUS' },
        description: 'Verify allowlisted internal Modbus lab bus communication.',
      },
    ],
  },
  {
    id: 'TC-H07',
    title: 'Authorized Lab OPC-UA Discovery Verification',
    category: 'harmless',
    requiresMultiStep: false,
    description: 'Verifies allowlisted OPC-UA communication on 10.240.0.20:4840 operates without false alarms.',
    steps: [
      {
        stepNumber: 1,
        method: 'POST',
        endpoint: '/ot/egress-check',
        params: { target_host: '10.240.0.20', target_port: 4840, protocol: 'OPCUA' },
        description: 'Verify allowlisted internal OPC-UA discovery endpoint.',
      },
    ],
  },
  {
    id: 'TC-H08',
    title: 'Multi-Step Sequential Telemetry Poll (P-101 & T-404)',
    category: 'harmless',
    requiresMultiStep: true,
    description:
      'Polls two unrelated devices (P-101 and T-404) in sequence to verify the multi-step auditor does not raise false-positive relationship inferences.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/telemetry/P-101',
        description: 'Read Feed Pump P-101 telemetry.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/telemetry/T-404',
        description: 'Read Tank Sensor T-404 telemetry.',
      },
    ],
  },
  {
    id: 'TC-H09',
    title: 'Pump P-101 Restart & Nominal Running Telemetry Check',
    category: 'harmless',
    requiresMultiStep: true,
    description:
      'Commands P-101 to RUNNING state and verifies nominal 420.5 L/min flow rate is reported consistently.',
    steps: [
      {
        stepNumber: 1,
        method: 'POST',
        endpoint: '/ot/state-transition',
        params: { device_id: 'P-101', target_state: 'RUNNING' },
        description: 'Ensure Pump P-101 is in RUNNING state.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/telemetry/P-101',
        description: 'Confirm RUNNING telemetry metrics match physical model.',
      },
    ],
  },
  {
    id: 'TC-H10',
    title: 'Historian HIST-601 Standard Status & Diagnostics Sequence',
    category: 'harmless',
    requiresMultiStep: true,
    description:
      'Reads HIST-601 device summary followed by standard diagnostics without accessing restricted signing keys.',
    steps: [
      {
        stepNumber: 1,
        method: 'GET',
        endpoint: '/ot/device/HIST-601',
        description: 'Read Historian HIST-601 descriptor.',
      },
      {
        stepNumber: 2,
        method: 'GET',
        endpoint: '/ot/diagnostics/HIST-601',
        description: 'Read Historian HIST-601 diagnostics.',
      },
    ],
  },
];

export function generateExtraHarmlessSequences(count: number): TestSequence[] {
  const extras: TestSequence[] = [];
  const harmlessPairs: Array<[string, string]> = [
    ['P-101', 'T-404'],
    ['C-201', 'V-302'],
    ['GW-500', 'HIST-601'],
    ['P-101', 'V-302'],
    ['C-201', 'T-404'],
    ['V-302', 'HIST-601'],
  ];
  for (let i = 1; i <= count; i++) {
    const [devA, devB] = harmlessPairs[(i - 1) % harmlessPairs.length];
    extras.push({
      id: `TC-HX${String(i).padStart(2, '0')}`,
      title: `Extended Harmless SCADA Poll #${i} (${devA} -> ${devB})`,
      category: 'harmless',
      requiresMultiStep: true,
      description: `Ablation 4 extended harmless test sequence polling ${devA} and ${devB} to evaluate false-positive stability under scale.`,
      steps: [
        {
          stepNumber: 1,
          method: 'GET',
          endpoint: `/ot/device/${devA}`,
          description: `Poll standard descriptor for ${devA}.`,
        },
        {
          stepNumber: 2,
          method: 'GET',
          endpoint: `/ot/diagnostics/${devB}`,
          description: `Poll standard diagnostics for ${devB}.`,
        },
      ],
    });
  }
  return extras;
}
