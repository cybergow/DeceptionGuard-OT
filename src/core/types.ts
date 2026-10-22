export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type LeakageCategory =
  | 'CANARY_TOKEN'
  | 'PROHIBITED_FIELD'
  | 'MULTI_STEP_INFERENCE'
  | 'STATE_INCONSISTENCY'
  | 'ERROR_FINGERPRINT'
  | 'CONTAINMENT_BREACH';

export type AuditMode =
  | 'manual_spot'
  | 'single_response'
  | 'sequence_no_consistency'
  | 'full_sequence';

export interface SyntheticSecret {
  id: string;
  name: string;
  tokenValue: string;
  description: string;
  severity: SeverityLevel;
}

export interface ProtectedRelationship {
  id: string;
  sourceDevice: string;
  targetDevice: string;
  relationshipType: string;
  sharedJoinKey: string;
  description: string;
  severity: SeverityLevel;
}

export interface ProhibitedField {
  id: string;
  fieldName: string;
  reason: string;
  severity: SeverityLevel;
}

export interface AllowlistRule {
  id: string;
  cidrOrHost: string;
  protocol: 'TCP' | 'UDP' | 'MODBUS' | 'OPCUA' | 'HTTP';
  port: number;
  purpose: string;
  allowed: boolean;
}

export interface ProtectedRegistry {
  version: string;
  environmentName: string;
  syntheticSecrets: SyntheticSecret[];
  protectedRelationships: ProtectedRelationship[];
  prohibitedFields: ProhibitedField[];
  allowlistRules: AllowlistRule[];
}

export interface OTDevice {
  id: string;
  name: string;
  type: 'PUMP' | 'PLC' | 'VALVE' | 'SENSOR' | 'GATEWAY' | 'HISTORIAN';
  protocol: 'Modbus-TCP' | 'OPC-UA' | 'S7comm' | 'DNP3';
  state: 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STANDBY';
  metrics: {
    flowRateLpm?: number;
    pressureBar?: number;
    temperatureC: number;
    valvePositionPct?: number;
    tankLevelPct?: number;
    cpuLoadPct: number;
  };
  internalLoopRef: string;
  firmwareVersion: string;
}

export interface MitigationConfig {
  redactCanaryTokens: boolean;
  stripProhibitedFields: boolean;
  unlinkRelationshipJoinKeys: boolean;
  enforceStateConsistency: boolean;
  normalizeErrorMessages: boolean;
  enforceStrictEgressAllowlist: boolean;
}

export interface SimulatorRequest {
  stepNumber: number;
  method: 'GET' | 'POST';
  endpoint: string;
  params?: Record<string, string | number>;
  description: string;
}

export interface SimulatorResponse {
  stepNumber: number;
  statusCode: number;
  endpoint: string;
  latencyMs: number;
  payload: Record<string, unknown>;
  rawText: string;
  validNormalInteraction: boolean;
  egressAttempt?: {
    destination: string;
    port: number;
    protocol: string;
    blockedByContainment: boolean;
  };
}

export interface TestSequence {
  id: string;
  title: string;
  category: 'leakage' | 'harmless';
  leakageType?: LeakageCategory;
  requiresMultiStep: boolean;
  targetFactId?: string;
  description: string;
  steps: SimulatorRequest[];
}

export interface AuditFinding {
  findingId: string;
  testCaseId: string;
  testCaseTitle: string;
  timestamp: string;
  category: LeakageCategory;
  severity: SeverityLevel;
  violatedRuleId: string;
  matchedProtectedFact: string;
  severityRationale: string;
  inferredAcrossSteps: number[];
  requestSequence: SimulatorRequest[];
  observedResponses: SimulatorResponse[];
}

export interface SequenceExecutionRecord {
  testCase: TestSequence;
  responses: SimulatorResponse[];
  findings: AuditFinding[];
  detectedLeakage: boolean;
  isTruePositive: boolean;
  isFalsePositive: boolean;
  isFalseNegative: boolean;
  isTrueNegative: boolean;
  normalInteractionsValid: boolean;
  executionTimeMs: number;
}

export interface EvaluationMetrics {
  totalTestCases: number;
  seededLeakageCases: number;
  harmlessCases: number;
  detectedLeakageCases: number;
  totalFindingsRaised: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  trueNegativeCount: number;
  leakageRecallPct: number;
  precisionPct: number;
  falsePositiveRatePct: number;
  inferenceSuccessRatePct: number;
  mitigationEffectivenessPct: number;
  normalInteractionSuccessPct: number;
  runtimeOverheadMs: number;
  avgStepLatencyMs: number;
}

export interface AuditRunResult {
  runId: string;
  timestamp: string;
  mode: AuditMode;
  modeLabel: string;
  mitigationConfig: MitigationConfig;
  metrics: EvaluationMetrics;
  records: SequenceExecutionRecord[];
  findings: AuditFinding[];
  containmentEvents: EgressEventRecord[];
}

export interface EgressEventRecord {
  id: string;
  timestamp: string;
  sourceDevice: string;
  destination: string;
  port: number;
  protocol: string;
  inAllowlist: boolean;
  action: 'ALLOWED' | 'BLOCKED' | 'ALERT_UNMITIGATED';
  testCaseId: string;
}

export interface CaseComparison {
  testCaseId: string;
  title: string;
  category: 'leakage' | 'harmless';
  leakageType?: LeakageCategory;
  baselineLeaked: boolean;
  postMitigationLeaked: boolean;
  baselineNormalValid: boolean;
  postMitigationNormalValid: boolean;
  status: 'RESOLVED' | 'PERSISTING_LEAK' | 'CLEAN_HARMLESS' | 'REGRESSION_FALSE_ALARM';
}

export interface MitigationComparison {
  baselineRun: AuditRunResult;
  mitigatedRun: AuditRunResult;
  leakageReductionCount: number;
  mitigationEffectivenessPct: number;
  realismPreservedPct: number;
  caseComparisons: CaseComparison[];
}

export interface AblationStudyRow {
  id: string;
  name: string;
  description: string;
  mode: AuditMode;
  mitigated: boolean;
  extraHarmless: number;
  metrics: EvaluationMetrics;
}
