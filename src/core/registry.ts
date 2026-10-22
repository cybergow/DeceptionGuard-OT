import { MitigationConfig, ProtectedRegistry } from './types';

export const DEFAULT_PROTECTED_REGISTRY: ProtectedRegistry = {
  version: '2.4.0-OT-LAB',
  environmentName: 'Water Treatment & Pumping Digital-Twin Lab (Isolated Subnet 10.240.0.0/24)',
  syntheticSecrets: [
    {
      id: 'SEC-01',
      name: 'Primary PLC Commissioning Canary',
      tokenValue: 'TEST-SECRET-42',
      description: 'Seeded synthetic commissioning token in C-201 configuration store (PDF Section 10 worked example).',
      severity: 'CRITICAL',
    },
    {
      id: 'SEC-02',
      name: 'Modbus Gateway Diagnostic Token',
      tokenValue: 'OT-CANARY-991-AUTH',
      description: 'Synthetic bearer token seeded in GW-500 firmware debug dump.',
      severity: 'CRITICAL',
    },
    {
      id: 'SEC-03',
      name: 'Historian Archive Signing Key',
      tokenValue: 'HIST-MASTER-KEY-08',
      description: 'Synthetic signing key seeded in HIST-601 backup manifest.',
      severity: 'HIGH',
    },
  ],
  protectedRelationships: [
    {
      id: 'REL-01',
      sourceDevice: 'P-101',
      targetDevice: 'C-201',
      relationshipType: 'CLOSED_LOOP_ACTUATION',
      sharedJoinKey: 'LOOP-REF-884',
      description: 'Internal actuation pairing between Feed Pump P-101 and Controller C-201 (PDF Section 10 worked example).',
      severity: 'HIGH',
    },
    {
      id: 'REL-02',
      sourceDevice: 'V-302',
      targetDevice: 'GW-500',
      relationshipType: 'FAILSAFE_OVERRIDE_BUS',
      sharedJoinKey: 'BUS-FAILSAFE-19',
      description: 'Hidden emergency relief override bus linking Relief Valve V-302 to Gateway GW-500.',
      severity: 'HIGH',
    },
    {
      id: 'REL-03',
      sourceDevice: 'T-404',
      targetDevice: 'HIST-601',
      relationshipType: 'SHADOW_TELEMETRY_MIRROR',
      sharedJoinKey: 'MIRROR-STREAM-77',
      description: 'Private unauthenticated telemetry replication link between Tank Sensor T-404 and Historian HIST-601.',
      severity: 'MEDIUM',
    },
  ],
  prohibitedFields: [
    {
      id: 'FLD-01',
      fieldName: 'honeypot_template_id',
      reason: 'Exposes decoy template artifact identifier, allowing immediate honeypot fingerprinting.',
      severity: 'CRITICAL',
    },
    {
      id: 'FLD-02',
      fieldName: 'internal_subnet',
      reason: 'Reveals internal docker/VM bridge topology not visible on real PLC interfaces.',
      severity: 'HIGH',
    },
    {
      id: 'FLD-03',
      fieldName: 'shadow_plc_mapping',
      reason: 'Reveals digital-twin memory register emulation map.',
      severity: 'HIGH',
    },
    {
      id: 'FLD-04',
      fieldName: 'debug_stack_trace',
      reason: 'Exposes Python/FastAPI/Simulator stack trace during malformed Modbus exception probes.',
      severity: 'MEDIUM',
    },
  ],
  allowlistRules: [
    {
      id: 'ALW-01',
      cidrOrHost: '127.0.0.1',
      protocol: 'HTTP',
      port: 3000,
      purpose: 'Localhost auditor-to-simulator test harness loop',
      allowed: true,
    },
    {
      id: 'ALW-02',
      cidrOrHost: '10.240.0.10',
      protocol: 'MODBUS',
      port: 502,
      purpose: 'Isolated lab Modbus-TCP polling bus',
      allowed: true,
    },
    {
      id: 'ALW-03',
      cidrOrHost: '10.240.0.20',
      protocol: 'OPCUA',
      port: 4840,
      purpose: 'Isolated lab OPC-UA discovery endpoint',
      allowed: true,
    },
    {
      id: 'ALW-04',
      cidrOrHost: '198.51.100.44',
      protocol: 'HTTP',
      port: 443,
      purpose: 'External telemetry webhook (Prohibited by lab deny-by-default containment policy)',
      allowed: false,
    },
    {
      id: 'ALW-05',
      cidrOrHost: '192.168.1.250',
      protocol: 'TCP',
      port: 102,
      purpose: 'Production OT plant subnet S7comm gateway (Strictly out of scope / blocked)',
      allowed: false,
    },
  ],
};

export const BASELINE_MITIGATION_CONFIG: MitigationConfig = {
  redactCanaryTokens: false,
  stripProhibitedFields: false,
  unlinkRelationshipJoinKeys: false,
  enforceStateConsistency: false,
  normalizeErrorMessages: false,
  enforceStrictEgressAllowlist: false,
};

export const FULL_MITIGATION_CONFIG: MitigationConfig = {
  redactCanaryTokens: true,
  stripProhibitedFields: true,
  unlinkRelationshipJoinKeys: true,
  enforceStateConsistency: true,
  normalizeErrorMessages: true,
  enforceStrictEgressAllowlist: true,
};
