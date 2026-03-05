import {
  formatSandboxImageId,
  getRequiredSandboxImages,
} from "@app/lib/api/sandbox/image";
import { listE2BTemplates } from "@app/lib/api/sandbox/providers/e2b_template";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface CheckResult {
  required: string[];
  existing: string[];
  missing: string[];
  buildMatrix: Array<{ image: string; tag: string }>;
}

async function checkSandboxImages(
  args: { json: boolean; failOnMissing: boolean; forceRebuild: boolean },
  logger: Logger
): Promise<void> {
  const { json, failOnMissing, forceRebuild } = args;

  const requiredImages = getRequiredSandboxImages();
  const requiredIds = requiredImages.map(formatSandboxImageId);

  const templatesResult = await listE2BTemplates();

  if (templatesResult.isErr()) {
    if (json) {
      console.log(
        JSON.stringify({ error: templatesResult.error.message }, null, 2)
      );
    } else {
      logger.error(
        { err: templatesResult.error },
        "Failed to list E2B templates"
      );
    }
    process.exit(1);
  }

  const templates = templatesResult.value;
  const existingIds = new Set<string>();

  for (const template of templates) {
    existingIds.add(template.templateId);
    for (const alias of template.aliases) {
      existingIds.add(alias);
    }
  }

  const existing: string[] = [];
  const missing: string[] = [];
  const buildMatrix: Array<{ image: string; tag: string }> = [];

  for (const id of requiredIds) {
    if (existingIds.has(id) && !forceRebuild) {
      existing.push(id);
    } else {
      missing.push(id);
    }
  }

  for (const imageId of requiredImages) {
    const formattedId = formatSandboxImageId(imageId);
    if (!existingIds.has(formattedId) || forceRebuild) {
      buildMatrix.push({
        image: imageId.imageName,
        tag: imageId.tag,
      });
    }
  }

  const result: CheckResult = {
    required: requiredIds,
    existing,
    missing,
    buildMatrix,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.info(
      {
        required: result.required.length,
        existing: result.existing.length,
        missing: result.missing.length,
      },
      "Sandbox image check completed"
    );

    if (result.missing.length > 0) {
      logger.warn({ missing: result.missing }, "Missing sandbox images");
    } else {
      logger.info("All required sandbox images exist");
    }
  }

  if (failOnMissing && result.missing.length > 0) {
    process.exit(1);
  }
}

makeScript(
  {
    json: {
      type: "boolean" as const,
      default: false,
      describe: "Output results as JSON",
    },
    "fail-on-missing": {
      type: "boolean" as const,
      default: false,
      describe: "Exit with error code if images are missing",
    },
    "force-rebuild": {
      type: "boolean" as const,
      default: false,
      describe: "Treat all images as missing (for rebuild)",
    },
  },
  async (args, logger) => {
    await checkSandboxImages(
      {
        json: args.json,
        failOnMissing: args["fail-on-missing"],
        forceRebuild: args["force-rebuild"],
      },
      logger
    );
  }
);
