import { PROFILE_DIR } from "@app/lib/api/sandbox/image/profile";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import {
  ALLOWLIST_NETWORK_POLICY,
  type ToolEntry,
} from "@app/lib/api/sandbox/image/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import fs from "fs";
import path from "path";

const DSBX_CLI_VERSION = "0.1.1";
// Built from https://github.com/openai/codex at tag rust-v0.115.0 (Apache-2.0).
// Released via the "Release sandbox tool" GitHub Actions workflow.
const APPLY_PATCH_VERSION = "0.1.0";
const PROFILE_LOCAL_DIR = path.resolve(__dirname, "profile");

interface PythonLibrary {
  name: string;
  version: string;
  description: string;
}

const PYTHON_LIBRARIES: PythonLibrary[] = [
  { name: "pandas", version: "3.0.1", description: "Data analysis library" },
  { name: "numpy", version: "2.4.3", description: "Numerical computing" },
  { name: "scipy", version: "1.17.1", description: "Scientific computing" },
  { name: "scikit-learn", version: "1.8.0", description: "Machine learning" },
  { name: "statsmodels", version: "0.14.6", description: "Statistical models" },
  { name: "pyarrow", version: "23.0.1", description: "Arrow data format" },
  { name: "matplotlib", version: "3.10.8", description: "Plotting library" },
  {
    name: "seaborn",
    version: "0.13.2",
    description: "Statistical visualization",
  },
  { name: "plotly", version: "6.6.0", description: "Interactive plots" },
  { name: "requests", version: "2.32.5", description: "HTTP library" },
  { name: "openpyxl", version: "3.1.5", description: "Excel file support" },
  { name: "xlsxwriter", version: "3.2.9", description: "Excel file writer" },
  { name: "pdfplumber", version: "0.11.9", description: "PDF extraction" },
  { name: "pypdf", version: "6.8.0", description: "PDF manipulation" },
  { name: "reportlab", version: "4.4.10", description: "PDF generation" },
  {
    name: "python-docx",
    version: "1.2.0",
    description: "Word document support",
  },
  { name: "python-pptx", version: "1.0.2", description: "PowerPoint support" },
  {
    name: "beautifulsoup4",
    version: "4.14.3",
    description: "HTML/XML parsing",
  },
  { name: "lxml", version: "6.0.2", description: "XML processing" },
  { name: "pillow", version: "12.1.1", description: "Image processing" },
  { name: "sympy", version: "1.14.0", description: "Symbolic mathematics" },
];

function getPythonToolEntries(): ToolEntry[] {
  return PYTHON_LIBRARIES.map((lib) => ({
    name: lib.name,
    version: lib.version,
    description: lib.description,
    runtime: "python" as const,
  }));
}

function getPythonInstallCmd(): string {
  const packages = PYTHON_LIBRARIES.map(
    (lib) => `${lib.name}==${lib.version}`
  ).join(" ");
  return `uv pip install --python /opt/venv ${packages}`;
}

function getProfileContent(filename: string): () => string {
  return () => fs.readFileSync(path.join(PROFILE_LOCAL_DIR, filename), "utf-8");
}

const DUST_BASE_IMAGE = SandboxImage.fromDocker("dust-sbx-bedrock:1.2.0")
  // Conversation files bootstrap
  // Pre-create workspace directory for faster GCS mounts.
  .runCmd(
    "sudo mkdir -p /files/conversation && sudo chmod 777 /files/conversation"
  )
  // Create simple netcat-based token server script.
  .runCmd("sudo mkdir -p /home/user/.bin")
  // TODO(2026-03-06 SANDBOX): .copy is broken, use file once fixed.
  .runCmd(`sudo tee /home/user/.bin/token-server.sh > /dev/null << 'SHELLEOF'
#!/bin/bash
while true; do
  (echo -ne "HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nContent-Length: $(stat -c %s /tmp/token.json 2>/dev/null || echo 0)\\r\\n\\r\\n"; cat /tmp/token.json 2>/dev/null) | nc -l -p 9876 -q 1
done
SHELLEOF`)
  .runCmd("sudo chmod 755 /home/user/.bin/token-server.sh")
  // Add sentinel file to indicate when mounts are pending.
  .runCmd("sudo touch /files/conversation/.mount-pending")
  // Hidden tools: installed but not in manifest (back profile functions)
  .runCmd("sudo apt-get update && sudo apt-get install -y ripgrep fd-find sd")
  // Create profile directory and copy profile scripts
  .registerTool(
    [
      { name: "git", description: "Version control system", runtime: "system" },
      { name: "curl", description: "HTTP client", runtime: "system" },
      { name: "wget", description: "Network downloader", runtime: "system" },
      { name: "jq", description: "JSON processor", runtime: "system" },
      { name: "sqlite3", description: "SQLite database", runtime: "system" },
      { name: "pandoc", description: "Document converter", runtime: "system" },
      {
        name: "imagemagick",
        description: "Image manipulation",
        runtime: "system",
      },
      { name: "ffmpeg", description: "Media processing", runtime: "system" },
      { name: "unzip", description: "Archive extraction", runtime: "system" },
      {
        name: "lsb-release",
        description: "Linux distribution info",
        runtime: "system",
      },
      {
        name: "file",
        description: "Determine file type",
        runtime: "system",
      },
    ],
    {
      // the other tools are installed in bedrock
      installCmd:
        "sudo apt-get install -y jq pandoc imagemagick ffmpeg unzip file",
    }
  )
  .registerTool({
    name: "python",
    description: "Python interpreter",
    runtime: "python",
  })
  .registerTool(getPythonToolEntries(), { installCmd: getPythonInstallCmd() })
  .registerTool(
    [
      {
        name: "typescript",
        description: "TypeScript compiler",
        runtime: "node",
      },
      { name: "tsx", description: "TypeScript executor", runtime: "node" },
    ],
    { installCmd: "npm install -g typescript tsx" }
  )
  .registerTool(
    { name: "dsbx", description: "Dust CLI", runtime: "system" },
    {
      installCmd:
        `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/dsbx-linux-x86_64 -o /tmp/dsbx && ` +
        `curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v${DSBX_CLI_VERSION}/checksums-sha256.txt -o /tmp/checksums-sha256.txt && ` +
        "grep dsbx-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/dsbx\"}' | sha256sum -c - && " +
        "chmod +x /tmp/dsbx && " +
        "sudo mv /tmp/dsbx /opt/bin/dsbx",
    }
  )
  .runCmd("sudo mkdir -p /skills && sudo chmod 755 /skills")
  .registerTool(
    {
      name: "apply_patch",
      description:
        "Apply V4A diffs to files. Supports add, update, and delete operations",
      usage:
        "apply_patch '*** Begin Patch\\n*** Update File: <path>\\n@@ [context]\\n-old\\n+new\\n*** End Patch'",
      returns: "Summary of applied changes (A/M/D per file)",
      runtime: "system",
      profile: "openai",
    },
    {
      installCmd:
        `curl -fsSL https://github.com/dust-tt/dust/releases/download/apply-patch-v${APPLY_PATCH_VERSION}/apply_patch-linux-x86_64 -o /tmp/apply_patch && ` +
        `curl -fsSL https://github.com/dust-tt/dust/releases/download/apply-patch-v${APPLY_PATCH_VERSION}/checksums-sha256.txt -o /tmp/checksums-sha256.txt && ` +
        "grep apply_patch-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/apply_patch\"}' | sha256sum -c - && " +
        "chmod +x /tmp/apply_patch && " +
        "sudo mv /tmp/apply_patch /opt/bin/apply_patch",
    }
  )
  .runCmd(`sudo mkdir -p ${PROFILE_DIR}`)
  .copy(getProfileContent("common.sh"), `${PROFILE_DIR}/common.sh`)
  .copy(getProfileContent("_truncate.sh"), `${PROFILE_DIR}/_truncate.sh`)
  .copy(getProfileContent("read_file.sh"), `${PROFILE_DIR}/read_file.sh`)
  .copy(getProfileContent("edit_file.sh"), `${PROFILE_DIR}/edit_file.sh`)
  .copy(getProfileContent("write_file.sh"), `${PROFILE_DIR}/write_file.sh`)
  .copy(getProfileContent("grep_files.sh"), `${PROFILE_DIR}/grep_files.sh`)
  .copy(getProfileContent("glob.sh"), `${PROFILE_DIR}/glob.sh`)
  .copy(getProfileContent("list_dir.sh"), `${PROFILE_DIR}/list_dir.sh`)
  .copy(getProfileContent("shell.sh"), `${PROFILE_DIR}/shell.sh`)
  // Profile functions (no install needed, provided by profile scripts)
  .registerTool([
    {
      name: "read_file",
      description: "Read file with line numbers",
      usage: "read_file <path> [start] [end]",
      returns: "Numbered lines (format: '  N\\tcontent')",
      runtime: "system",
    },
    {
      name: "edit_file",
      description:
        "Replace exact text in files. Fails per-file if old_text not found or matches multiple times",
      usage: "edit_file <old_text> <new_text> <path1> [path2]...",
      returns: "'Edited <path>' per success",
      runtime: "system",
    },
    {
      name: "write_file",
      description: "Write content to file (creates parent directories)",
      usage: "write_file <path> <content>",
      returns: "'Wrote <path>' on success",
      runtime: "system",
    },
    {
      name: "grep_files",
      description:
        "Search files for regex pattern. context_lines adds N lines before/after each match (default 0)",
      usage: "grep_files <pattern> [glob] [path] [max_results] [context_lines]",
      returns:
        "file:line:content format, truncated to max_results (default 200)",
      runtime: "system",
    },
    {
      name: "glob",
      description: "Find files by glob pattern",
      usage: "glob <pattern> [path]",
      returns: "File paths, one per line. Truncated to 200 results",
      runtime: "system",
    },
    {
      name: "list_dir",
      description: "List directory contents. depth defaults to 2, max 5",
      usage: "list_dir [path] [depth]",
      returns: "File/dir paths, limited to 200 entries",
      runtime: "system",
    },
    {
      name: "shell",
      description: "Execute shell command. Combines stdout/stderr",
      usage: "shell <command> [timeout_sec]",
      returns:
        "Command output, truncated to 50000 chars (full output saved to /tmp when truncated)",
      runtime: "system",
    },
  ])
  .withCapability("gcsfuse")
  .withResources({ vcpu: 2, memoryMb: 2048 })
  .withNetwork(ALLOWLIST_NETWORK_POLICY)
  .setWorkdir("/home/user")
  .withToolManifest()
  .register({
    imageName: "dust-base",
    tag: "0.4.0",
  });

const IMAGES: readonly SandboxImage[] = [DUST_BASE_IMAGE];

export function getRegisteredImages(): readonly SandboxImage[] {
  return IMAGES.filter((image) => {
    if (!image.imageId) {
      logger.warn("Skipping unregistered sandbox image (no imageId)");
      return false;
    }
    return true;
  });
}

export function getSandboxImageFromRegistry(opts: {
  name: string;
  tag?: string;
}): Result<SandboxImage, Error> {
  const { name, tag } = opts;
  const image = getRegisteredImages().find((img) => {
    if (img.imageId?.imageName !== name) {
      return false;
    }
    if (tag !== undefined && img.imageId?.tag !== tag) {
      return false;
    }
    return true;
  });
  if (!image) {
    const id = tag ? `${name}:${tag}` : name;
    return new Err(new Error(`No sandbox image found: ${id}`));
  }
  return new Ok(image);
}
