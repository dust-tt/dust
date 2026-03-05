import config from "@app/lib/api/config";
import {
  getSandboxImage,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import { buildSandboxImage } from "@app/lib/api/sandbox/providers/e2b_template";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface BuildArgs {
  image: string;
  tag: string;
  execute: boolean;
  skipCache: boolean;
}

async function buildImage(args: BuildArgs, logger: Logger): Promise<void> {
  const { image: imageName, tag, execute, skipCache } = args;

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

  logger.info(
    { sandboxImage: "DUST_BASE_IMAGE", imageName, tag },
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
      },
      "Would build sandbox image via E2B SDK (dry-run)"
    );
    return;
  }

  const result = await buildSandboxImage(sandboxImage, imageId, {
    ...(apiKey ? { apiKey } : {}),
    skipCache,
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
  },
  async (args, logger) => {
    await buildImage(
      {
        image: args.image,
        tag: args.tag,
        execute: args.execute,
        skipCache: args["skip-cache"],
      },
      logger
    );
  }
);
