variable "run_id" {
  type        = string
  description = "Unique run id, e.g. 20261008-1432. Used in names and labels."
  validation {
    condition     = can(regex("^[a-z0-9-]{1,30}$", var.run_id))
    error_message = "run_id must be lowercase letters, digits and dashes (max 30 chars)."
  }
}

variable "owner" {
  type    = string
  default = "henry"
}

variable "project" {
  type    = string
  default = "dust-dev"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zones" {
  type    = list(string)
  default = ["us-central1-a", "us-central1-b", "us-central1-f"]
}

variable "fdb_machine_type" {
  type    = string
  default = "n2-standard-8"
}

variable "fdb_nodes_per_zone" {
  type    = number
  default = 2
}

variable "server_machine_type" {
  type    = string
  default = "n2-highmem-8"
}

variable "server_nodes_per_zone" {
  type    = number
  default = 1
}

variable "tools_machine_type" {
  type    = string
  default = "n2-standard-4"
}
