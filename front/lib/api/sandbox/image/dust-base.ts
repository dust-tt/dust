/**
 * Dust base sandbox image.
 *
 * This module defines the standard Dust sandbox image with all
 * pre-installed tools and packages using the imperative builder API.
 */

import type { Authenticator } from "@app/lib/auth";

import { SandboxImage } from "./sandbox_image";
import type { NetworkPolicy } from "./types";

// TODO(@henry): Change this once S7 is up and running
export const ALLOWLIST_NETWORK_POLICY: NetworkPolicy = {
  mode: "deny_all",
  allowlist: [
    "storage.googleapis.com",
    "*.dust.tt",
    "pypi.org",
    "registry.npmjs.org",
    "github.com",
    "static.rust-lang.org",
    "crates.io",
    "static.crates.io",
    "index.crates.io",
  ],
};

export function getSandboxImage(_auth?: Authenticator): SandboxImage {
  return DUST_BASE_IMAGE;
}

/**
 * The base Dust sandbox image.
 *
 * Includes common development tools, Python data science packages,
 * Node.js tooling, and the dust sandbox CLI.
 */
export const DUST_BASE_IMAGE = SandboxImage.fromUbuntu("22.04")
  // Install build essentials (not registered as user-facing tools)
  // TODO (@jd): build an optimized base docker image that can be pulled
  // with npm/python/rust bootstrapping
  .runCmd(
    "sudo apt-get update && sudo apt-get install -y curl ca-certificates gnupg build-essential"
  )
  .setEnv({
    NPM_CONFIG_PREFIX: "/opt/npm-global",
    CARGO_HOME: "/opt/cargo",
    RUSTUP_HOME: "/opt/rustup",
    VIRTUAL_ENV: "/opt/venv",
  })
  // Install uv, then Python 3.14 via uv (not bound to Ubuntu's old Python)
  .runCmd("curl -LsSf https://astral.sh/uv/install.sh | sh")
  .runCmd("uv python install 3.14")
  // Create venv at user-writable location with uv-managed Python
  .runCmd(
    "sudo mkdir -p /opt/venv && sudo chmod -R 777 /opt/venv && " +
      "uv venv /opt/venv --python 3.14"
  )
  // Install Node.js via nodesource
  .runCmd(
    "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - " +
      "&& sudo apt-get install -y --no-install-recommends nodejs"
  )
  .runCmd("sudo mkdir -p /opt/npm-global && sudo chmod -R 777 /opt/npm-global")
  .runCmd("sudo mkdir -p /opt/bin && sudo chmod -R 777 /opt/bin")
  .runCmd(
    "sudo mkdir -p /opt/cargo /opt/rustup && sudo chmod -R 777 /opt/cargo /opt/rustup"
  )
  // Set environment variables for build-time operations (NOT persisted to runtime).
  // E2B's setEnvs() only applies during build, not in the snapshot.
  // Install Rust
  .runCmd(
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal " +
      "&& sudo chmod -R 777 /opt/cargo /opt/rustup"
  )
  // Everything above would typically be in a Docker image
  // Install system tools
  .registerTool(
    [
      { name: "git", description: "Version control system" },
      { name: "jq", description: "JSON processor" },
      { name: "pandoc", description: "Document converter" },
      { name: "imagemagick", description: "Image manipulation" },
      { name: "ffmpeg", description: "Media processing" },
      { name: "lsb-release", description: "Linux distribution info" },
    ],
    {
      installCmd:
        "sudo apt-get install -y git jq pandoc imagemagick ffmpeg lsb-release",
    }
  )
  // Register Python runtime
  .registerTool({ name: "python", description: "Python interpreter" })
  // Install Python packages
  .registerTool(
    [
      { name: "pandas", description: "Data analysis library" },
      { name: "numpy", description: "Numerical computing" },
      { name: "matplotlib", description: "Plotting library" },
      { name: "requests", description: "HTTP library" },
      { name: "openpyxl", description: "Excel file support" },
      { name: "pdfplumber", description: "PDF extraction" },
    ],
    {
      installCmd:
        "uv pip install --python /opt/venv pandas numpy matplotlib requests openpyxl pdfplumber",
    }
  )
  // Install Node packages
  .registerTool(
    [
      { name: "typescript", description: "TypeScript compiler" },
      { name: "tsx", description: "TypeScript executor" },
      { name: "bun", description: "JavaScript runtime" },
    ],
    { installCmd: "npm install -g typescript tsx bun" }
  )
  // Install Dust sandbox CLI
  .registerTool(
    { name: "dsbx", description: "Dust CLI" },
    {
      installCmd:
        "git clone --depth 1 https://github.com/dust-tt/dust.git /tmp/dust && " +
        "cargo install --path /tmp/dust/cli/dust-sandbox --root /opt/cargo && " +
        "sudo rm -rf /tmp/dust",
    }
  )
  // Persist PATH and VIRTUAL_ENV to /etc/profile.d/ so they're available at runtime.
  // E2B's setEnvs() only applies during build, so we write to the filesystem snapshot.
  .runCmd(
    'echo "export PATH=/opt/venv/bin:/opt/cargo/bin:/opt/bin:/opt/npm-global/bin:\\$PATH" | sudo tee /etc/profile.d/dust-path.sh && ' +
      'echo "export VIRTUAL_ENV=/opt/venv" | sudo tee -a /etc/profile.d/dust-path.sh'
  )
  .withResources({ vcpu: 2, memoryMb: 2048 })
  .withNetwork(ALLOWLIST_NETWORK_POLICY)
  .setWorkdir("/home/user");
