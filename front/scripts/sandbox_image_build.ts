import {
  formatSandboxImageId,
  getSandboxImageFromRegistry,
  getSandboxImageFromRegistryByName,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import {
  buildSandboxImage,
  createGCPRegistryFactory,
} from "@app/lib/api/sandbox/providers/e2b_template";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface BuildArgs {
  image: string;
  tag: string;
  execute: boolean;
  skipCache: boolean;
  dockerRegistry?: string;
  force: boolean;
}

async function buildImage(args: BuildArgs, logger: Logger): Promise<void> {
  const {
    image: imageName,
    tag,
    execute,
    skipCache,
    dockerRegistry,
    force,
  } = args;

  if (!isValidSandboxImageName(imageName)) {
    const available = getSandboxImageNames().join(", ");
    logger.error(
      { imageName, available },
      "Invalid image name. Available: " + available
    );
    process.exit(1);
  }

  if (!isValidSandboxImageTag(tag)) {
    const available = getSandboxImageTags().join(", ");
    logger.error({ tag, available }, "Invalid tag. Available: " + available);
    process.exit(1);
  }

  const imageId: SandboxImageId = { imageName, tag };

  const sandboxImageResult = force
    ? getSandboxImageFromRegistryByName(imageName)
    : getSandboxImageFromRegistry(imageId);

  if (sandboxImageResult.isErr()) {
    logger.error(
      { imageId: formatSandboxImageId(imageId) },
      "Image not found in registry"
    );
    process.exit(1);
  }

  if (force) {
    logger.warn(
      { imageName, tag },
      "Force mode: building image with tag that may differ from registry"
    );
  }

  const sandboxImage = sandboxImageResult.value;

  const usesDockerBase = sandboxImage.baseImage.type === "docker";
  if (usesDockerBase && !dockerRegistry) {
    logger.error(
      { imageName },
      "Image uses Docker base. Please provide --docker-registry option"
    );
    process.exit(1);
  }

  logger.info(
    { imageName, tag, usesDockerBase, dockerRegistry: dockerRegistry ?? "N/A" },
    "Building sandbox image"
  );

  if (!execute) {
    logger.info(
      {
        imageName,
        tag,
        skipCache,
        operationCount: sandboxImage.operations.length,
        toolCount: sandboxImage.tools.length,
      },
      "Would build sandbox image via E2B SDK (dry-run)"
    );
    return;
  }

  const dockerRegistryFactory = dockerRegistry
    ? createGCPRegistryFactory(
        dockerRegistry,
        process.env.SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT ?? ""
      )
    : undefined;

  const result = await buildSandboxImage(sandboxImage, imageId, {
    skipCache,
    dockerRegistryFactory,
  });

  if (result.isErr()) {
    logger.error({ err: result.error }, "Failed to build sandbox image");
    process.exit(1);
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
      demandOption: true,
      describe: "E2B image tag (e.g., production, staging)",
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
    force: {
      alias: "f",
      type: "boolean" as const,
      default: false,
      describe:
        "Build image even if exact tag is not registered (uses image config by name)",
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
        force: args.force,
      },
      logger
    );
  }
);
