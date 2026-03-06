import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import { SandboxImage } from "./sandbox_image";
import type { SandboxImageId, SandboxImageName } from "./types";
import { ALLOWLIST_NETWORK_POLICY } from "./types";

const DUST_BASE_IMAGE = SandboxImage.fromDocker("dust-sbx-bedrock:v0.1.0")
  .setBuildEnv({
    NPM_CONFIG_PREFIX: "/opt/npm-global",
    CARGO_HOME: "/opt/cargo",
    RUSTUP_HOME: "/opt/rustup",
    VIRTUAL_ENV: "/opt/venv",
  })
  .runCmd("sudo mkdir -p /opt/npm-global && sudo chmod -R 777 /opt/npm-global")
  .runCmd("sudo mkdir -p /opt/bin && sudo chmod -R 777 /opt/bin")
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
        "git clone --depth 1 https://github.com/dust-tt/dust.git /tmp/dust && " +
        "cargo install --path /tmp/dust/cli/dust-sandbox --root /opt/cargo && " +
        "sudo rm -rf /tmp/dust",
    }
  )
  .runCmd(
    'echo "export PATH=/opt/venv/bin:/opt/cargo/bin:/opt/bin:/opt/npm-global/bin:\\$PATH" | sudo tee /etc/profile.d/dust-path.sh && ' +
      'echo "export VIRTUAL_ENV=/opt/venv" | sudo tee -a /etc/profile.d/dust-path.sh'
  )
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
