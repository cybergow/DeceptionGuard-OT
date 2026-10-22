# DeceptionGuard-OT

**Automated Discovery and Verification of Information-Leakage Paths in Digital-Twin Industrial Honeypots**

[![CI/CD Audit Gate](https://img.shields.io/badge/CI%2FCD-DeceptionGuard--OT%20Pass-10b981)](./.github/workflows/ci.yml)
[![Recall](https://img.shields.io/badge/Leakage%20Recall-100.0%25-0ea5e9)](#quantitative-evaluation)
[![False Positive Rate](https://img.shields.io/badge/False--Positive%20Rate-0.0%25-10b981)](#quantitative-evaluation)

DeceptionGuard-OT is a full-stack industrial honeypot security auditing platform, 3D Purdue / Water-Treatment Digital Twin (Three.js / WebGL), and standalone CLI suite. It discovers direct and multi-step information-leakage paths across OT/SCADA endpoints, verifies cyber-physical state-machine consistency, enforces RFC1918 subnet containment (`10.240.0.0/24`), and proves mitigation effectiveness via automated Before/After retesting.

---

## Core Architecture (8 Modules)

1. **Module 1 — Target Digital-Twin OT Honeypot (`src/core/simulator.ts` & `src/core/honeypotDaemon.mjs`)**
   - Models a 6-device water-treatment sector (`WT-SECTOR-04`):
     - `P-101`: Centrifugal Feed Pump (`Modbus-TCP`, Level 0)
     - `V-302`: Motorized Relief Valve (`Modbus-TCP`, Level 0)
     - `T-404`: Clarifier Basin Ultrasonic Sensor (`OPC-UA`, Level 0)
     - `C-201`: Primary Process PLC (`S7comm`, Level 1)
     - `HIST-601`: Plant Process Historian (`DNP3`, Level 2)
     - `GW-500`: Industrial Protocol Gateway (`OPC-UA`, Level 3)
2. **Module 2 — Protected-Information Registry (`src/core/registry.ts`)**
   - Ground-truth specification of seeded canary secrets (`TEST-SECRET-42`, `OT-CANARY-991-AUTH`, `HIST-MASTER-KEY-08`), protected multi-device relationships (`LOOP-REF-884`, `BUS-FAILSAFE-19`, `MIRROR-STREAM-77`), prohibited internal/decoy fields, and egress allowlist rules.
3. **Module 3 — Multi-Interaction Sequence Generator (`src/core/sequences.ts`)**
   - 20 repeatable test sequences: 10 seeded leakage paths (`TC-L01` to `TC-L10`) and 10 harmless operational control sequences (`TC-H01` to `TC-H10`), plus scalable stress-test sequence generation.
4. **Module 4 — Multi-Step Sequence Leakage & Consistency Auditor (`src/core/auditor.ts`)**
   - Correlates join tokens across multi-step sequences (`TC-L02`, `TC-L04`, `TC-L06`) and validates physical state-machine invariants (`TC-L07`, `TC-L08`).
5. **Module 5 — Containment & Outbound Egress Monitor (`src/core/liveAuditor.ts`)**
   - Enforces Section 15 isolated lab subnet rules (`127.0.0.0/8` & `10.240.0.0/24`) and blocks unauthorized external callbacks (`TC-L10`).
6. **Module 6 — Reproducible Evidence Logger (`src/components/AuditEvidenceView.tsx`)**
   - Captures step-by-step HTTP/OT request traces, JSON payloads, violated rule rationales, and latency metrics.
7. **Module 7 — Automated Mitigation & Retest Engine (`src/components/MitigationRetestView.tsx`)**
   - Applies 6 hardening policies and re-runs the 20-sequence suite to verify 100.0% leakage elimination while preserving 100.0% normal interaction behavior.
8. **Module 8 — 3D Purdue Model, Physical Water-Treatment Plant & Ablation Engine (`src/components/ThreeDPlantTopologyStudio.tsx`)**
   - Real-time Three.js / WebGL digital twin with Mode A (3D Plant Floor), Mode B (Stratified Purdue PERA Stack), Mode C (3D Attack Graph), packet raytracing, cross-endpoint inference lasers, DVR time-scrubber, and Ablations 1–4.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the 9 automated unit & live-socket tests
npm test

# 3. Start the full-stack Express + Vite server on port 3000
npm run dev

# 4. (Optional) Launch the standalone local honeypot daemon on port 4040
node src/core/honeypotDaemon.mjs --port 4040
```

---

## Quantitative Evaluation Summary

| Methodology | Leakage Recall | Precision | False-Positive Rate | Multi-Step Inference |
| :--- | :---: | :---: | :---: | :---: |
| **A. Manual Spot Checks** | 30.0% (3/10) | 100.0% | 0.0% | 0.0% |
| **B. Single-Response Rules (Ablation 1)** | 50.0% (5/10) | 100.0% | 0.0% | 0.0% |
| **Ablation 2: Sequence w/o State Check** | 80.0% (8/10) | 100.0% | 0.0% | 100.0% |
| **C. DeceptionGuard-OT Full Sequence Audit** | **100.0% (10/10)** | **100.0%** | **0.0%** | **100.0%** |
| **Post-Mitigation Retest (Ablation 3)** | **0 Leaks Remaining (100% Fixed)** | **100.0%** | **0.0%** | **100.0% Realism Preserved** |
