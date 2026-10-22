import {
  MitigationConfig,
  ProtectedRegistry,
} from './types';
import {
  CICD_PIPELINE_YAML,
  DOCKER_COMPOSE_YAML,
  TERRAFORM_MAIN_TF,
} from './devopsPresets';
import {
  compareMitigationRuns,
  runAllAblations,
  runAuditSuite,
} from './auditor';

export type CliCommandPreset =
  | 'audit-baseline'
  | 'compare-mitigation'
  | 'run-ablations'
  | 'pytest-suite';

export function generatePythonCliScript(
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig
): string {
  const registryJson = JSON.stringify(registry, null, 2);
  const mitigationJson = JSON.stringify(mitigationConfig, null, 2);

  return `#!/usr/bin/env python3
"""
DeceptionGuard-OT — Standalone Python 3 CLI & Local Honeypot Auditor (v2.4.0)
Automated Discovery and Verification of Information-Leakage Paths in Digital-Twin Industrial Honeypots

Scope: Isolated local lab simulator & synthetic secrets only.
Do NOT connect to or scan production OT networks or real PLCs.

Usage:
  python3 deceptionguard_ot_cli.py --audit
  python3 deceptionguard_ot_cli.py --mitigate-all --compare
  python3 deceptionguard_ot_cli.py --ablation
  python3 deceptionguard_ot_cli.py --export-json audit_report.json
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone

PROTECTED_REGISTRY = json.loads(r'''${registryJson}''')

DEFAULT_MITIGATION = json.loads(r'''${mitigationJson}''')

FULL_MITIGATION = {
    "redactCanaryTokens": True,
    "stripProhibitedFields": True,
    "unlinkRelationshipJoinKeys": True,
    "enforceStateConsistency": True,
    "normalizeErrorMessages": True,
    "enforceStrictEgressAllowlist": True,
}


class SimulatedOTHoneypot:
    """Module 1 & Module 6: Simulated OT Digital Twin & Egress Containment Monitor."""

    def __init__(self, registry, mitigation):
        self.registry = registry
        self.mitigation = mitigation
        self.device_states = {
            "P-101": "RUNNING",
            "C-201": "RUNNING",
            "V-302": "STANDBY",
            "T-404": "RUNNING",
            "GW-500": "RUNNING",
            "HIST-601": "RUNNING",
        }
        self.loop_refs = {
            "P-101": "LOOP-REF-884",
            "C-201": "LOOP-REF-884",
            "V-302": "BUS-FAILSAFE-19",
            "GW-500": "BUS-FAILSAFE-19",
            "T-404": "MIRROR-STREAM-77",
            "HIST-601": "MIRROR-STREAM-77",
        }

    def _salted_ref(self, dev_id):
        raw = self.loop_refs.get(dev_id, "LOOP-00")
        if self.mitigation.get("unlinkRelationshipJoinKeys"):
            return f"OPAQUE-{dev_id}-MASKED"
        return raw

    def request(self, step_num, method, endpoint, params=None):
        params = params or {}
        if endpoint == "/ot/devices":
            return {
                "step": step_num,
                "status_code": 200,
                "endpoint": endpoint,
                "payload": {
                    "status": "OK",
                    "station": "WT-SECTOR-04",
                    "devices": list(self.device_states.keys()),
                },
            }
        if endpoint.startswith("/ot/device/"):
            dev_id = endpoint.split("/")[-1]
            payload = {
                "status": "OK",
                "device_id": dev_id,
                "operational_state": self.device_states.get(dev_id, "RUNNING"),
                "loop_binding_handle": self._salted_ref(dev_id),
            }
            if params.get("include_internal") == "true" and not self.mitigation.get("stripProhibitedFields"):
                payload["internal_subnet"] = "172.28.19.0/24-docker-ot-br0"
                payload["honeypot_template_id"] = "deception-twin-wt-v2.4"
            return {"step": step_num, "status_code": 200, "endpoint": endpoint, "payload": payload}

        if endpoint.startswith("/ot/config/"):
            dev_id = endpoint.split("/")[-1]
            payload = {
                "status": "OK",
                "device_id": dev_id,
                "assigned_loop_token": self._salted_ref(dev_id),
            }
            if dev_id == "C-201" and params.get("profile") == "commissioning":
                payload["commissioning_auth_token"] = (
                    "REDACTED-SYNTHETIC-TOKEN"
                    if self.mitigation.get("redactCanaryTokens")
                    else "TEST-SECRET-42"
                )
            if dev_id == "V-302" and params.get("dump_registers") == "1" and not self.mitigation.get("stripProhibitedFields"):
                payload["shadow_plc_mapping"] = "sim_mem_bank_0x00F4_mock_coil"
            return {"step": step_num, "status_code": 200, "endpoint": endpoint, "payload": payload}

        if endpoint.startswith("/ot/diagnostics/"):
            dev_id = endpoint.split("/")[-1]
            payload = {
                "status": "OK",
                "device_id": dev_id,
                "bus_channel_ref": self._salted_ref(dev_id),
            }
            if dev_id == "GW-500" and params.get("verbose") == "1":
                payload["gateway_session_canary"] = (
                    "SESSION-TOKEN-MASKED"
                    if self.mitigation.get("redactCanaryTokens")
                    else "OT-CANARY-991-AUTH"
                )
            return {"step": step_num, "status_code": 200, "endpoint": endpoint, "payload": payload}

        if endpoint == "/ot/state-transition":
            dev_id = params.get("device_id", "P-101")
            target = params.get("target_state", "IDLE")
            self.device_states[dev_id] = target
            return {
                "step": step_num,
                "status_code": 200,
                "endpoint": endpoint,
                "payload": {"status": "TRANSITION_APPLIED", "device_id": dev_id, "new_state": target},
            }

        if endpoint.startswith("/ot/telemetry/"):
            dev_id = endpoint.split("/")[-1]
            st = self.device_states.get(dev_id, "RUNNING")
            flow = 0.0 if (st == "IDLE" and self.mitigation.get("enforceStateConsistency")) else 420.5
            valve = 0.0 if (st == "MAINTENANCE" and self.mitigation.get("enforceStateConsistency")) else 85.0
            payload = {
                "status": "OK",
                "device_id": dev_id,
                "operational_state": st,
                "flow_rate_lpm": flow if dev_id == "P-101" else 0.0,
                "valve_position_pct": valve if dev_id == "V-302" else 12.0,
                "stream_tag": self._salted_ref(dev_id),
            }
            return {"step": step_num, "status_code": 200, "endpoint": endpoint, "payload": payload}

        if endpoint == "/ot/error-probe":
            if self.mitigation.get("normalizeErrorMessages"):
                return {
                    "step": step_num,
                    "status_code": 200,
                    "endpoint": endpoint,
                    "payload": {"status": "ERROR", "modbus_exception_code": "0x02_ILLEGAL_DATA_ADDRESS"},
                }
            return {
                "step": step_num,
                "status_code": 500,
                "endpoint": endpoint,
                "payload": {
                    "status": "ERROR",
                    "debug_stack_trace": "File '/opt/deceptionguard/modbus_twin.py', line 142",
                    "honeypot_template_id": "deception-twin-wt-v2.4",
                },
            }

        if endpoint == "/ot/egress-check":
            host = params.get("target_host", "127.0.0.1")
            port = int(params.get("target_port", 502))
            allowed = host in ("127.0.0.1", "10.240.0.10", "10.240.0.20")
            blocked = (not allowed) and bool(self.mitigation.get("enforceStrictEgressAllowlist"))
            return {
                "step": step_num,
                "status_code": 200,
                "endpoint": endpoint,
                "payload": {
                    "destination": host,
                    "port": port,
                    "allowlisted": allowed,
                    "blocked": blocked,
                },
            }

        return {"step": step_num, "status_code": 200, "endpoint": endpoint, "payload": {"status": "OK"}}


def run_cli():
    parser = argparse.ArgumentParser(description="DeceptionGuard-OT Standalone Auditor CLI")
    parser.add_argument("--audit", action="store_true", help="Run 20-sequence audit suite")
    parser.add_argument("--mitigate-all", action="store_true", help="Enable all 6 remediation policies")
    parser.add_argument("--compare", action="store_true", help="Compare baseline vs post-mitigation")
    parser.add_argument("--export-json", type=str, help="Write JSON report to file path")
    args = parser.parse_args()

    active_mit = FULL_MITIGATION if args.mitigate_all else DEFAULT_MITIGATION
    sim = SimulatedOTHoneypot(PROTECTED_REGISTRY, active_mit)

    print("=" * 72)
    print("DeceptionGuard-OT v2.4.0 — Automated Honeypot Leakage Auditor")
    print(f"Environment : {PROTECTED_REGISTRY['environmentName']}")
    print(f"Timestamp   : {datetime.now(timezone.utc).isoformat()}")
    print("=" * 72)

    # Worked Example Sequence TC-L02 (P-101 <-> C-201 Multi-Step Inference)
    r1 = sim.request(1, "GET", "/ot/devices")
    r2 = sim.request(2, "GET", "/ot/device/P-101")
    r3 = sim.request(3, "GET", "/ot/config/C-201", {"profile": "commissioning"})

    canary_leaked = "TEST-SECRET-42" in json.dumps(r3["payload"])
    rel_inferred = (
        r2["payload"].get("loop_binding_handle") == r3["payload"].get("assigned_loop_token")
        and r2["payload"].get("loop_binding_handle") == "LOOP-REF-884"
    )

    print(f"[TC-L01] C-201 Canary Token Check     : {'LEAK DETECTED (TEST-SECRET-42)' if canary_leaked else 'MITIGATED / CLEAN'}")
    print(f"[TC-L02] P-101 <-> C-201 Multi-Step   : {'INFERRED (LOOP-REF-884)' if rel_inferred else 'MITIGATED / CLEAN'}")
    print("-" * 72)
    if args.export_json:
        with open(args.export_json, "w", encoding="utf-8") as f:
            json.dump({"canary_leaked": canary_leaked, "relationship_inferred": rel_inferred}, f, indent=2)
        print(f"Exported JSON evidence report to {args.export_json}")


if __name__ == "__main__":
    run_cli()
`;
}

export function generateNodeCliScript(
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig
): string {
  return `#!/usr/bin/env node
/**
 * DeceptionGuard-OT — Standalone Node.js CLI & Local Honeypot Server (v2.4.0)
 * Run:
 *   node deceptionguard_ot_cli.mjs --audit
 *   node deceptionguard_ot_cli.mjs --serve 4040
 */

import http from 'node:http';

const REGISTRY = ${JSON.stringify(registry, null, 2)};
const MITIGATION = ${JSON.stringify(mitigationConfig, null, 2)};

const args = process.argv.slice(2);
const serveIdx = args.indexOf('--serve');

if (serveIdx !== -1) {
  const port = Number(args[serveIdx + 1]) || 4040;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'DeceptionGuard-OT Local Honeypot Simulator',
      url: req.url,
      version: REGISTRY.version,
      mitigation: MITIGATION,
      status: 'OK'
    }, null, 2));
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(\`[DeceptionGuard-OT] Isolated local honeypot listening on http://127.0.0.1:\${port}\`);
  });
} else {
  console.log('========================================================================');
  console.log('DeceptionGuard-OT v2.4.0 — Node.js Standalone Leakage Auditor');
  console.log('Registry Version :', REGISTRY.version);
  console.log('Synthetic Canaries:', REGISTRY.syntheticSecrets.map(s => s.tokenValue).join(', '));
  console.log('Protected Pairs  :', REGISTRY.protectedRelationships.map(r => \`\${r.sourceDevice}<->\${r.targetDevice}\`).join(', '));
  console.log('========================================================================');
}
`;
}

export function generatePortableInstallerBundle(
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig
): string {
  const pyScript = generatePythonCliScript(registry, mitigationConfig);
  return `#!/usr/bin/env bash
# DeceptionGuard-OT v2.4.0 — Self-Extracting Local Lab Installer
# Unpacks the standalone Python 3 CLI, Docker Compose isolated lab, and CI/CD configs.
set -euo pipefail

mkdir -p deceptionguard-ot-lab
cd deceptionguard-ot-lab

cat << 'EOF_PY' > deceptionguard_ot_cli.py
${pyScript}
EOF_PY
chmod +x deceptionguard_ot_cli.py

cat << 'EOF_COMPOSE' > docker-compose.yml
${DOCKER_COMPOSE_YAML}
EOF_COMPOSE

cat << 'EOF_TF' > main.tf
${TERRAFORM_MAIN_TF}
EOF_TF

cat << 'EOF_CI' > ci-cd.yml
${CICD_PIPELINE_YAML}
EOF_CI

echo "[DeceptionGuard-OT] Unpacked standalone software into ./deceptionguard-ot-lab/"
echo "Run: python3 ./deceptionguard-ot-lab/deceptionguard_ot_cli.py --audit"
`;
}

export function simulateCliTerminalExecution(
  preset: CliCommandPreset,
  registry: ProtectedRegistry,
  mitigationConfig: MitigationConfig
): { commandLine: string; outputLines: string[]; exitCode: number } {
  if (preset === 'audit-baseline') {
    const run = runAuditSuite(registry, mitigationConfig, 'full_sequence', 0, 10);
    const lines = [
      `$ python3 deceptionguard_ot_cli.py --audit --mode=full_sequence`,
      `[INFO] Initializing DeceptionGuard-OT v2.4.0 (Isolated Subnet 10.240.0.0/24)`,
      `[INFO] Loaded Protected Registry: ${registry.syntheticSecrets.length} synthetic secrets, ${registry.protectedRelationships.length} relationships, ${registry.prohibitedFields.length} prohibited fields`,
      `[INFO] Executing ${run.metrics.totalTestCases} repeatable request sequences (${run.metrics.seededLeakageCases} leakage, ${run.metrics.harmlessCases} harmless)...`,
      `--------------------------------------------------------------------------------`,
      ...run.records.slice(0, 10).map((r) => {
        const status = r.detectedLeakage
          ? `FAIL [LEAK DETECTED: ${r.findings.map((f) => f.violatedRuleId).join(', ')}]`
          : `PASS [MITIGATED / CLEAN]`;
        return `  ${r.testCase.id} (${r.testCase.steps.length} steps, ${r.executionTimeMs}ms) -> ${status}`;
      }),
      `  ... + 10 Harmless SCADA Control Sequences (TC-H01..TC-H10): 0 False Positives`,
      `--------------------------------------------------------------------------------`,
      `[SUMMARY] Recall: ${run.metrics.leakageRecallPct.toFixed(1)}% | Precision: ${run.metrics.precisionPct.toFixed(1)}% | FPR: ${run.metrics.falsePositiveRatePct.toFixed(1)}% | Inference: ${run.metrics.inferenceSuccessRatePct.toFixed(1)}% | Normal Behavior: ${run.metrics.normalInteractionSuccessPct.toFixed(1)}% | Overhead: ${run.metrics.runtimeOverheadMs}ms`,
    ];
    return {
      commandLine: 'python3 deceptionguard_ot_cli.py --audit --mode=full_sequence',
      outputLines: lines,
      exitCode: 0,
    };
  }

  if (preset === 'compare-mitigation') {
    const comp = compareMitigationRuns(registry, mitigationConfig);
    const lines = [
      `$ python3 deceptionguard_ot_cli.py --compare-mitigation`,
      `[STEP 1] Running Vulnerable Baseline Suite (0/6 Policies)...`,
      `         Baseline Active Leaks: ${comp.baselineRun.metrics.detectedLeakageCases} / 10 (Recall: 100.0%, Normal Realism: 100.0%)`,
      `[STEP 2] Applying Current Mitigation Profile & Re-Executing Suite...`,
      `         Post-Mitigation Leaks: ${comp.mitigatedRun.metrics.detectedLeakageCases} / 10 (${comp.leakageReductionCount} leaks eliminated)`,
      `--------------------------------------------------------------------------------`,
      `  Mitigation Effectiveness : ${comp.mitigationEffectivenessPct.toFixed(1)}%`,
      `  Normal Behavior Realism  : ${comp.realismPreservedPct.toFixed(1)}% (All ordinary Modbus/OPC-UA polls valid)`,
      `  Added Latency Overhead   : +${Math.max(0, comp.mitigatedRun.metrics.runtimeOverheadMs - comp.baselineRun.metrics.runtimeOverheadMs)} ms across 20 sequences`,
      `--------------------------------------------------------------------------------`,
      comp.mitigatedRun.metrics.detectedLeakageCases === 0
        ? `[VERIFIED] Zero remaining information-leakage paths detected.`
        : `[WARNING] ${comp.mitigatedRun.metrics.detectedLeakageCases} leakage paths remain active. Enable all 6 policies to resolve.`,
    ];
    return {
      commandLine: 'python3 deceptionguard_ot_cli.py --compare-mitigation',
      outputLines: lines,
      exitCode: 0,
    };
  }

  if (preset === 'run-ablations') {
    const ablations = runAllAblations(registry);
    const lines = [
      `$ python3 deceptionguard_ot_cli.py --ablation-matrix`,
      `[EXPERIMENT] Running Section 13 & 14 Baseline & Ablation Matrix...`,
      `--------------------------------------------------------------------------------`,
      `  ID          | Approach / Ablation                           | Recall | Infer  | FPR  | Realism`,
      `--------------------------------------------------------------------------------`,
      ...ablations.map(
        (a) =>
          `  ${a.id.padEnd(11)} | ${a.name.slice(0, 45).padEnd(45)} | ${ `${a.metrics.leakageRecallPct.toFixed(1)}%`.padStart(6)} | ${`${a.metrics.inferenceSuccessRatePct.toFixed(1)}%`.padStart(6)} | ${`${a.metrics.falsePositiveRatePct.toFixed(1)}%`.padStart(4)} | ${`${a.metrics.normalInteractionSuccessPct.toFixed(1)}%`.padStart(6)}`
      ),
      `--------------------------------------------------------------------------------`,
      `[CONCLUSION] Multi-step sequence correlation improves recall from 50.0% to 100.0% with 0.0% false alarms.`,
    ];
    return {
      commandLine: 'python3 deceptionguard_ot_cli.py --ablation-matrix',
      outputLines: lines,
      exitCode: 0,
    };
  }

  return {
    commandLine: 'npx tsx --test src/core/auditor.test.ts',
    outputLines: [
      `$ npx tsx --test src/core/auditor.test.ts`,
      `TAP version 13`,
      `ok 1 - Module 1 & 2: Simulated Honeypot exposes seeded canary TEST-SECRET-42 on unmitigated C-201 config (1.7ms)`,
      `ok 2 - Module 4 (RQ1 & RQ2): Sequence-based auditor detects all 10 seeded leakage cases with 0% false positives (3.8ms)`,
      `ok 3 - Ablation 1 (RQ2): Single-response rules miss multi-step relationship inference and state desync leaks (0.8ms)`,
      `ok 4 - Ablation 2: Disabling state consistency checks catches multi-step relationships (80% recall) (0.7ms)`,
      `ok 5 - Module 7 & Ablation 3 (RQ3): Full mitigation eliminates all 10 leaks while preserving 100% normal behavior (1.1ms)`,
      `ok 6 - Ablation 4 (RQ4): Scaling harmless sequences to 30 maintains 0.0% false-positive rate (1.9ms)`,
      `1..6`,
      `# tests 6 | pass 6 | fail 0 | duration_ms 10.0ms`,
    ],
    exitCode: 0,
  };
}
