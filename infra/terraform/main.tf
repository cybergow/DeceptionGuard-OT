# DeceptionGuard-OT Scalable Cloud Infrastructure & Air-Gapped Lab VPC
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
