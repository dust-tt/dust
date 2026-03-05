/**
 * Dust base sandbox image.
 *
 * This module defines the standard Dust sandbox image with all
 * pre-installed tools and packages using the imperative builder API.
 *
 * The base Docker image (dust-sdbx-bedrock) provides:
 * - Python 3.14 via uv with venv at /opt/venv
 * - Node.js 22
 * - Bun
 * - Rust toolchain
 * - Basic system tools (curl, git, ca-certificates)
 *
 * This image definition adds additional tools and packages on top.
 */

import { SandboxImage } from "./sandbox_image";
import type { NetworkPolicy } from "./types";

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

/**
 * The base Dust sandbox image.
 *
 * Built on top of dust-sdbx-bedrock Docker image, this adds:
 * - System tools (jq, pandoc, imagemagick, ffmpeg)
 * - Python data science packages
 * - Node.js tooling (typescript, tsx)
 * - Dust sandbox CLI
 */
export const DUST_BASE_IMAGE = SandboxImage.fromDocker(
  "dust-sbx-bedrock:latest"
)
  // Set environment variables (these apply during build operations)
  .setEnv({
    NPM_CONFIG_PREFIX: "/opt/npm-global",
    CARGO_HOME: "/opt/cargo",
    RUSTUP_HOME: "/opt/rustup",
    VIRTUAL_ENV: "/opt/venv",
  })
  // Create npm-global and bin directories for additional package installs
  .runCmd("sudo mkdir -p /opt/npm-global && sudo chmod -R 777 /opt/npm-global")
  .runCmd("sudo mkdir -p /opt/bin && sudo chmod -R 777 /opt/bin")
  // Install system tools (git is already in base image)
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
        "sudo apt-get update && sudo apt-get install -y jq pandoc imagemagick ffmpeg lsb-release",
    }
  )
  // Register Python runtime (already installed in base image)
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
  // Register Bun (already installed in base image)
  .registerTool({ name: "bun", description: "JavaScript runtime" })
  // Install Node packages
  .registerTool(
    [
      { name: "typescript", description: "TypeScript compiler" },
      { name: "tsx", description: "TypeScript executor" },
    ],
    { installCmd: "npm install -g typescript tsx" }
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
