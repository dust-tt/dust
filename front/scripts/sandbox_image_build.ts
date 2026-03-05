import config from "@app/lib/api/config";
import {
  formatSandboxImageId,
  getRequiredSandboxImages,
  getSandboxImageFromRegistry,
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
  listE2BTemplates,
} from "@app/lib/api/sandbox/providers/e2b_template";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface BuildArgs {
  image: string;
  tag: string;
  execute: boolean;
  skipCache: boolean;
  dockerRegistry?: string;
  ci: boolean;
  allMissing: boolean;
}

interface CIResult {
  success: boolean;
  built: string[];
  failed: string[];
  skipped: string[];
}

async function buildSingleImage(
  imageId: SandboxImageId,
  dockerRegistryFactory: DockerRegistryFactory | undefined,
  skipCache: boolean,
  logger: Logger
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  const { apiKey } = config.getE2BSandboxConfig();
  const sandboxImageResult = getSandboxImageFromRegistry(imageId);
  if (sandboxImageResult.isErr()) {
    return {
      success: false,
      error: `Image not found in registry: ${formatSandboxImageId(imageId)}`,
    };
  }

  const result = await buildSandboxImage(sandboxImageResult.value, imageId, {
    ...(apiKey ? { apiKey } : {}),
    skipCache,
    dockerRegistryFactory,
  });

  if (result.isErr()) {
    return { success: false, error: result.error.message };
  }

  return { success: true, templateId: result.value };
}

async function buildAllMissing(
  args: BuildArgs,
  logger: Logger
): Promise<CIResult> {
  const result: CIResult = {
    success: true,
    built: [],
    failed: [],
    skipped: [],
  };

  const templatesResult = await listE2BTemplates();
  if (templatesResult.isErr()) {
    logger.error(
      { err: templatesResult.error },
      "Failed to list E2B templates"
    );
    result.success = false;
    return result;
  }

  const existingIds = new Set<string>();
  for (const template of templatesResult.value) {
    existingIds.add(template.templateId);
    for (const alias of template.aliases) {
      existingIds.add(alias);
    }
  }

  const requiredImages = getRequiredSandboxImages();
  const missingImages = requiredImages.filter(
    (img) => !existingIds.has(formatSandboxImageId(img))
  );

  if (missingImages.length === 0) {
    logger.info("All required sandbox images already exist");
    return result;
  }

  let dockerRegistryFactory: DockerRegistryFactory | undefined;
  if (args.dockerRegistry) {
    const serviceAccountPath = process.env.SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT;
    if (!serviceAccountPath) {
      logger.error(
        "SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT env var required (path to service account JSON file)"
      );
      result.success = false;
      return result;
    }
    dockerRegistryFactory = createGCPRegistryFactory(
      args.dockerRegistry,
      serviceAccountPath
    );
  }

  for (const imageId of missingImages) {
    const formattedId = formatSandboxImageId(imageId);
    logger.info({ imageId: formattedId }, "Building missing image");

    if (!args.execute) {
      logger.info({ imageId: formattedId }, "Would build (dry-run)");
      result.skipped.push(formattedId);
      continue;
    }

    const sandboxImageResult = getSandboxImageFromRegistry(imageId);
    if (sandboxImageResult.isErr()) {
      logger.error({ imageId: formattedId }, "Image not found in registry");
      result.failed.push(formattedId);
      result.success = false;
      continue;
    }

    const usesDockerBase = sandboxImageResult.value.baseImage.type === "docker";

    if (usesDockerBase && !dockerRegistryFactory) {
      logger.error(
        { imageId: formattedId },
        "Image uses Docker base but no --docker-registry provided"
      );
      result.failed.push(formattedId);
      result.success = false;
      continue;
    }

    const buildResult = await buildSingleImage(
      imageId,
      dockerRegistryFactory,
      args.skipCache,
      logger
    );

    if (buildResult.success) {
      logger.info(
        { imageId: formattedId, templateId: buildResult.templateId },
        "Built successfully"
      );
      result.built.push(formattedId);
    } else {
      logger.error(
        { imageId: formattedId, error: buildResult.error },
        "Failed to build"
      );
      result.failed.push(formattedId);
      result.success = false;
    }
  }

  return result;
}

async function buildImage(args: BuildArgs, logger: Logger): Promise<void> {
  const {
    image: imageName,
    tag,
    execute,
    skipCache,
    dockerRegistry,
    ci,
  } = args;

  if (args.allMissing) {
    const result = await buildAllMissing(args, logger);
    if (ci) {
      console.log(JSON.stringify(result, null, 2));
    }
    if (!result.success) {
      process.exit(1);
    }
    return;
  }

  if (!isValidSandboxImageName(imageName)) {
    const available = getSandboxImageNames().join(", ");
    logger.error(
      { imageName, available },
      "Invalid image name. Available images: " + available
    );
    if (ci) {
      console.log(
        JSON.stringify({ success: false, error: "Invalid image name" })
      );
    }
    process.exit(1);
  }

  if (!isValidSandboxImageTag(tag)) {
    const available = getSandboxImageTags().join(", ");
    logger.error(
      { tag, available },
      "Invalid tag. Available tags: " + available
    );
    if (ci) {
      console.log(JSON.stringify({ success: false, error: "Invalid tag" }));
    }
    process.exit(1);
  }

  const imageId: SandboxImageId = { imageName, tag };
  const sandboxImageResult = getSandboxImageFromRegistry(imageId);
  if (sandboxImageResult.isErr()) {
    logger.error({ imageName, tag }, "Image not found in registry");
    if (ci) {
      console.log(
        JSON.stringify({
          success: false,
          error: "Image not found in registry",
        })
      );
    }
    process.exit(1);
  }
  const sandboxImage = sandboxImageResult.value;

  const usesDockerBase = sandboxImage.baseImage.type === "docker";
  if (usesDockerBase && !dockerRegistry) {
    logger.error(
      { imageName },
      "Image uses Docker base. Please provide --docker-registry option (e.g., us-docker.pkg.dev/project/repo)"
    );
    if (ci) {
      console.log(
        JSON.stringify({
          success: false,
          error: "Docker registry required for Docker base images",
        })
      );
    }
    process.exit(1);
  }

  logger.info(
    {
      sandboxImage: imageName,
      tag,
      usesDockerBase,
      dockerRegistry: dockerRegistry ?? "N/A",
    },
    "Building sandbox image"
  );

  if (!execute && !ci) {
    logger.info(
      {
        imageName,
        tag,
        skipCache,
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
    const serviceAccountPath = process.env.SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT;
    if (!serviceAccountPath) {
      logger.error(
        { imageName },
        "SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT env var required (path to service account JSON file)"
      );
      if (ci) {
        console.log(
          JSON.stringify({
            success: false,
            error: "SBX_GCP_ARTIFACT_RO_SERVICE_ACCOUNT not set",
          })
        );
      }
      process.exit(1);
    }
    dockerRegistryFactory = createGCPRegistryFactory(
      dockerRegistry,
      serviceAccountPath
    );
  }

  const result = await buildSingleImage(
    imageId,
    dockerRegistryFactory,
    skipCache,
    logger
  );

  if (result.success) {
    logger.info(
      { templateId: result.templateId, imageName, tag },
      "Sandbox image built successfully"
    );
    if (ci) {
      console.log(
        JSON.stringify({
          success: true,
          templateId: result.templateId,
          imageName,
          tag,
        })
      );
    }
  } else {
    logger.error({ error: result.error }, "Failed to build sandbox image");
    if (ci) {
      console.log(
        JSON.stringify({ success: false, error: result.error, imageName, tag })
      );
    }
    process.exit(1);
  }
}

makeScript(
  {
    image: {
      type: "string" as const,
      default: "dust-base",
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
    ci: {
      type: "boolean" as const,
      default: false,
      describe: "CI mode: execute by default, JSON output",
    },
    "all-missing": {
      type: "boolean" as const,
      default: false,
      describe: "Build all missing images from registry check",
    },
  },
  async (args, logger) => {
    const execute = args.ci || args.execute;
    await buildImage(
      {
        image: args.image,
        tag: args.tag,
        execute,
        skipCache: args["skip-cache"],
        dockerRegistry: args["docker-registry"],
        ci: args.ci,
        allMissing: args["all-missing"],
      },
      logger
    );
  }
);
