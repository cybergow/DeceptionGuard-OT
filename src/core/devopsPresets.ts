export interface LiteratureEntry {
  id: string;
  citation: string;
  venue: string;
  doiUrl: string;
  focusArea: string;
  gapAddressedByDeceptionGuard: string;
}

export const STARTING_LITERATURE_REFERENCES: LiteratureEntry[] = [
  {
    id: 'REF-01',
    citation:
      'Ontology-Driven Semantic Honeypot with Digital Twin Integration for Context-Aware Cyber Deception in Industrial OT Systems',
    venue: 'IEEE ICECS 2025',
    doiUrl: 'https://doi.org/10.1109/ICECS66544.2025.11270675',
    focusArea: 'Ontology-based semantic responses and digital-twin context synchronization.',
    gapAddressedByDeceptionGuard:
      'Focuses on building realistic semantic responses rather than auditing multi-step cross-endpoint information leakage or automated mitigation verification.',
  },
  {
    id: 'REF-02',
    citation:
      'ICSHIve: A Framework for Measurable and High-Interactive Honeypots in Industrial Control Systems',
    venue: 'IEEE Transactions on Industrial Informatics, 2026',
    doiUrl: 'https://doi.org/10.1109/TII.2026.3694947',
    focusArea: 'High-interaction ICS honeypot deployment and attacker interaction measurement.',
    gapAddressedByDeceptionGuard:
      'Measures external attacker engagement, whereas DeceptionGuard-OT provides a defensive pre-deployment audit harness for synthetic secret & relationship leakage.',
  },
  {
    id: 'REF-03',
    citation:
      'Time-to-lie: Identifying industrial control system honeypots using the internet control message protocol',
    venue: 'IEEE ICDCS Workshops 2025',
    doiUrl: 'https://doi.org/10.1109/ICDCSW63273.2025.00141',
    focusArea: 'Network-layer ICMP timing and fingerprinting of ICS honeypots.',
    gapAddressedByDeceptionGuard:
      'Addresses application/protocol-layer multi-interaction inference and before/after remediation testing while preserving valid normal interaction behavior.',
  },
  {
    id: 'REF-04',
    citation:
      'All that Glitters is not Gold: Uncovering Exposed Industrial Control Systems and Honeypots in the Wild',
    venue: 'IEEE EuroS&P 2025',
    doiUrl: 'https://doi.org/10.1109/EuroSP63326.2025.00017',
    focusArea: 'Large-scale internet scanning and passive/active honeypot identification heuristics.',
    gapAddressedByDeceptionGuard:
      'Provides an isolated, ethical local lab testing pipeline using seeded synthetic canaries and repeatable multi-step sequences prior to deployment.',
  },
];

export const CICD_PIPELINE_YAML = `name: DeceptionGuard-OT Enterprise CI/CD & Deception Assurance Pipeline

on:
  push:
    branches: [ main, release/* ]
  pull_request:
    branches: [ main ]

permissions:
  contents: read
  security-events: write
  id-token: write

jobs:
  static-analysis-and-unit-tests:
    name: Typecheck, Lint & Deterministic Unit Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22 LTS
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: TypeScript Strict Type Verification
        run: npm run lint

      - name: Run Core Auditor & Multi-Step Inference Unit Tests
        run: npx tsx --test src/core/auditor.test.ts

  honeypot-leakage-regression-gate:
    name: Automated Deception Leakage & Realism Gate
    needs: static-analysis-and-unit-tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22 LTS
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Verify Zero Unmitigated Leaks & 100% Normal Behavior Consistency
        run: npx tsx -e "
          import { DEFAULT_PROTECTED_REGISTRY } from './src/core/registry';
          import { compareMitigationRuns } from './src/core/auditor';
          import { FULL_MITIGATION_CONFIG } from './src/core/registry';
          const result = compareMitigationRuns(DEFAULT_PROTECTED_REGISTRY, FULL_MITIGATION_CONFIG);
          if (result.mitigatedRun.metrics.detectedLeakageCases !== 0) process.exit(1);
          if (result.mitigatedRun.metrics.normalInteractionSuccessPct < 100) process.exit(1);
          console.log('Gate Passed: 100% Mitigation Effectiveness, 100% Realism Preserved');
        "

  container-build-and-cloud-deploy:
    name: Build Isolated Container & Deploy to Cloud Run
    needs: honeypot-leakage-regression-gate
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Build Production Bundle
        run: |
          npm ci
          npm run build

      - name: Trivy Container Vulnerability Scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'

      - name: Deploy to Google Cloud Run (Isolated VPC Connector)
        run: |
          echo "Deploying DeceptionGuard-OT to Cloud Run (asia-southeast1) with VPC egress=private-ranges-only"
`;

export const DOCKER_COMPOSE_YAML = `version: "3.9"

# Section 12 & 15 Compliance: Isolated Host-Only / Internal Lab Topology
# Blocks all outbound internet connections by default (internal: true).

services:
  deceptionguard-auditor-web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: dg-ot-auditor
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - OT_LAB_SUBNET=10.240.0.0/24
      - CONTAINMENT_POLICY=DENY_BY_DEFAULT
    networks:
      ot_isolated_lab_net:
        ipv4_address: 10.240.0.5
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true

networks:
  ot_isolated_lab_net:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 10.240.0.0/24
`;

export const TERRAFORM_MAIN_TF = `# DeceptionGuard-OT Scalable Cloud Infrastructure & Air-Gapped Lab VPC
# Provisions an isolated VPC subnet, deny-by-default egress firewall rules,
# and auto-scaling Cloud Run auditor service.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP Project ID for DeceptionGuard-OT Lab"
}

variable "region" {
  type    = string
  default = "asia-southeast1"
}

resource "google_compute_network" "ot_honeypot_lab_vpc" {
  name                    = "deceptionguard-ot-isolated-vpc"
  auto_create_subnetworks = false
   project                 = var.project_id
}

resource "google_compute_subnetwork" "ot_lab_subnet" {
  name                     = "ot-digital-twin-subnet"
  ip_cidr_range            = "10.240.0.0/24"
  region                   = var.region
  network                  = google_compute_network.ot_honeypot_lab_vpc.id
  private_ip_google_access = true
  project                  = var.project_id
}

# Section 6 (Module 6) & Section 15: Deny-by-Default Outbound Egress Firewall
resource "google_compute_firewall" "deny_all_external_egress" {
  name      = "dg-ot-deny-external-egress"
  network   = google_compute_network.ot_honeypot_lab_vpc.name
  direction = "EGRESS"
  priority  = 1000
  project   = var.project_id

  deny {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_internal_lab_bus" {
  name      = "dg-ot-allow-internal-subnet"
  network   = google_compute_network.ot_honeypot_lab_vpc.name
  direction = "EGRESS"
  priority  = 900
  project   = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3000", "502", "4840"]
  }

  destination_ranges = ["10.240.0.0/24", "127.0.0.1/32"]
}

resource "google_cloud_run_v2_service" "deceptionguard_ot_service" {
  name     = "deceptionguard-ot-auditor"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }
    containers {
      image = "\${var.region}-docker.pkg.dev/\${var.project_id}/ot-security/deceptionguard-ot:latest"
      ports {
        container_port = 3000
      }
      env {
        name  = "CONTAINMENT_POLICY"
        value = "DENY_BY_DEFAULT"
      }
    }
  }
}
`;
