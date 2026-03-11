import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { ALLOWLIST_NETWORK_POLICY } from "@app/lib/api/sandbox/image/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DUST_BASE_IMAGE = SandboxImage.fromDocker("dust-sbx-bedrock:1.1.0")
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
  .registerTool({ name: "python", description: "Python interpreter" })
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
  .registerTool({ name: "bun", description: "JavaScript runtime" })
  .registerTool(
    [
      { name: "typescript", description: "TypeScript compiler" },
      { name: "tsx", description: "TypeScript executor" },
    ],
    { installCmd: "npm install -g typescript tsx" }
  )
  .registerTool(
    { name: "dsbx", description: "Dust CLI" },
    {
      installCmd:
        "curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v0.1.0/dsbx-linux-x86_64 -o /tmp/dsbx && " +
        "curl -fsSL https://github.com/dust-tt/dust/releases/download/dsbx-v0.1.0/checksums-sha256.txt -o /tmp/checksums-sha256.txt && " +
        "grep dsbx-linux-x86_64 /tmp/checksums-sha256.txt | awk '{print $1 \"  /tmp/dsbx\"}' | sha256sum -c - && " +
        "chmod +x /tmp/dsbx && " +
        "sudo mv /tmp/dsbx /opt/bin/dsbx",
    }
  )
  .withResources({ vcpu: 2, memoryMb: 2048 })
  .withNetwork(ALLOWLIST_NETWORK_POLICY)
  .setWorkdir("/home/user")
  .register({
    imageName: "dust-base",
    tag: "0.2.1",
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
