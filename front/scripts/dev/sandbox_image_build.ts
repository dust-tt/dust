import config from "@app/lib/api/config";
import {
  getSandboxImage,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import {
  buildSandboxImage,
  createGCPRegistryFactory,
  type DockerRegistryFactory,
} from "@app/lib/api/sandbox/providers/e2b_template";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface BuildArgs {
  image: string;
  tag: string;
  execute: boolean;
  skipCache: boolean;
  dockerRegistry?: string;
}

async function buildImage(args: BuildArgs, logger: Logger): Promise<void> {
  const { image: imageName, tag, execute, skipCache, dockerRegistry } = args;

  if (!isValidSandboxImageName(imageName)) {
    const available = getSandboxImageNames().join(", ");
    logger.error(
      { imageName, available },
      "Invalid image name. Available images: " + available
    );
    return;
  }

  if (!isValidSandboxImageTag(tag)) {
    const available = getSandboxImageTags().join(", ");
    logger.error(
      { tag, available },
      "Invalid tag. Available tags: " + available
    );
    return;
  }

  const imageId: SandboxImageId = { imageName, tag };
  const { apiKey } = config.getE2BSandboxConfig();
  const sandboxImage = getSandboxImage();

  // Check if the image uses Docker base and registry is required
  const usesDockerBase = sandboxImage.baseImage.type === "docker";
  if (usesDockerBase && !dockerRegistry) {
    logger.error(
      { imageName },
      "Image uses Docker base. Please provide --dockerRegistry option (e.g., us-docker.pkg.dev/project/repo)"
    );
    return;
  }

  logger.info(
    {
      sandboxImage: "DUST_BASE_IMAGE",
      imageName,
      tag,
      usesDockerBase,
      dockerRegistry: dockerRegistry ?? "N/A",
    },
    "Using DUST_BASE_IMAGE for build"
  );

  if (!execute) {
    logger.info(
      {
        imageName,
        tag,
        skipCache,
        hasApiKey: Boolean(apiKey),
        operationCount: sandboxImage.operations.length,
        toolCount: sandboxImage.tools.length,
        dockerRegistry: dockerRegistry ?? "N/A",
      },
      "Would build sandbox image via E2B SDK (dry-run)"
    );
    return;
  }

  let dockerRegistryFactory: DockerRegistryFactory | undefined;
  if (dockerRegistry) {
    dockerRegistryFactory = createGCPRegistryFactory(
      dockerRegistry,
      config.getSandboxGcpArtifactServiceAccountPath()
    );
  }

  const result = await buildSandboxImage(sandboxImage, imageId, {
    ...(apiKey ? { apiKey } : {}),
    skipCache,
    dockerRegistryFactory,
  });

  if (result.isErr()) {
    logger.error({ err: result.error }, "Failed to build sandbox image");
    return;
  }

  logger.info(
    { templateId: result.value, imageName, tag },
    "Sandbox image built successfully"
  );
}

makeScript(
  {
    image: {
      type: "string" as const,
      demandOption: true,
      describe: "Image name (e.g., dust-base)",
    },
    tag: {
      type: "string" as const,
      default: "staging",
      describe: "E2B image tag",
    },
    "skip-cache": {
      type: "boolean" as const,
      default: false,
      describe: "Force rebuild without using cache",
    },
    "docker-registry": {
      type: "string" as const,
      describe:
        "Docker registry URL for images using Docker base (e.g., us-docker.pkg.dev/project/repo)",
    },
  },
  async (args, logger) => {
    await buildImage(
      {
        image: args.image,
        tag: args.tag,
        execute: args.execute,
        skipCache: args["skip-cache"],
        dockerRegistry: args["docker-registry"],
      },
      logger
    );
  }
);
