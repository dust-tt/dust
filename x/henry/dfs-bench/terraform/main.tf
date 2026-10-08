terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # Bucket and prefix are passed by bin/up: gs://<bucket>/runs/<run_id>/tfstate.
  backend "gcs" {}
}

provider "google" {
  project = var.project
  region  = var.region
}

locals {
  cluster_name = "dfsb-${var.run_id}"
  # Every billable resource carries these labels; bin/leak-check and bin/sweep rely on them.
  labels = {
    "dfs-bench"     = "true"
    "dfs-bench-run" = var.run_id
    "owner"         = var.owner
  }
  pools = {
    fdb = {
      machine_type = var.fdb_machine_type
      per_zone     = var.fdb_nodes_per_zone
      tainted      = true
    }
    server = {
      machine_type = var.server_machine_type
      per_zone     = var.server_nodes_per_zone
      tainted      = true
    }
    # Untainted: operator, router, orchestrator, front simulator.
    tools = {
      machine_type = var.tools_machine_type
      per_zone     = 1
      tainted      = false
    }
  }
}

resource "google_container_cluster" "bench" {
  name                     = local.cluster_name
  location                 = var.region
  node_locations           = var.zones
  deletion_protection      = false
  remove_default_node_pool = true
  initial_node_count       = 1
  networking_mode          = "VPC_NATIVE"
  resource_labels          = local.labels

  ip_allocation_policy {}

  release_channel {
    channel = "REGULAR"
  }

  workload_identity_config {
    workload_pool = "${var.project}.svc.id.goog"
  }

  # Only used for the throwaway default pool.
  node_config {
    machine_type    = "e2-small"
    disk_size_gb    = 20
    resource_labels = local.labels
  }
}

resource "google_container_node_pool" "pools" {
  for_each = local.pools

  name           = each.key
  cluster        = google_container_cluster.bench.id
  location       = var.region
  node_locations = var.zones
  node_count     = each.value.per_zone

  node_config {
    machine_type    = each.value.machine_type
    disk_type       = "pd-balanced"
    disk_size_gb    = 100
    resource_labels = local.labels
    labels = {
      "dfs-bench/role" = each.key
    }
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    dynamic "taint" {
      for_each = each.value.tainted ? [each.key] : []
      content {
        key    = "dfs-bench/role"
        value  = taint.value
        effect = "NO_SCHEDULE"
      }
    }
  }
}

output "cluster_name" {
  value = google_container_cluster.bench.name
}
