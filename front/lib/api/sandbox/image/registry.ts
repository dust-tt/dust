import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type {
  SandboxImageId,
  SandboxImageName,
} from "@app/lib/api/sandbox/image/types";
import { ALLOWLIST_NETWORK_POLICY } from "@app/lib/api/sandbox/image/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DUST_BASE_IMAGE = SandboxImage.fromDocker("dust-sbx-bedrock:v0.1.1")
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
  // Add sentinel file to indicate when mounts are pending.
  .runCmd("sudo touch /files/conversation/.mount-pending")
  .withResources({ vcpu: 2, memoryMb: 2048 })
  .withNetwork(ALLOWLIST_NETWORK_POLICY)
  .setWorkdir("/home/user")
  .register({ imageName: "dust-base", tag: "v0.1.1" });

const IMAGES: readonly SandboxImage[] = [DUST_BASE_IMAGE];

function getRegisteredImages(): readonly SandboxImage[] {
  return IMAGES.filter((image) => {
    if (!image.imageId) {
      logger.warn("Skipping unregistered sandbox image (no imageId)");
      return false;
    }
    return true;
  });
}

export function getRequiredSandboxImages(): readonly SandboxImageId[] {
  return getRegisteredImages()
    .map((image) => image.imageId)
    .filter((id): id is SandboxImageId => id !== undefined);
}

export function getSandboxImageFromRegistry(
  id: SandboxImageId
): Result<SandboxImage, Error> {
  const image = getRegisteredImages().find(
    (img) =>
      img.imageId?.imageName === id.imageName && img.imageId?.tag === id.tag
  );
  if (!image) {
    return new Err(
      new Error(`No sandbox image found for id: ${id.imageName}:${id.tag}`)
    );
  }
  return new Ok(image);
}

export function getSandboxImageFromRegistryByName(
  name: SandboxImageName
): Result<SandboxImage, Error> {
  const image = getRegisteredImages().find(
    (img) => img.imageId?.imageName === name
  );
  if (!image) {
    return new Err(new Error(`No sandbox image found for name: ${name}`));
  }
  return new Ok(image);
}
