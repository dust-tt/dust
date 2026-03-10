import {
  formatSandboxImageId,
  getRegisteredImages,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import { listE2BTemplates } from "@app/lib/api/sandbox/providers/e2b_template";
import logger from "@app/logger/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface CheckResult {
  required: string[];
  existing: string[];
  missing: string[];
  buildMatrix: Array<{ image: string; tag: string }>;
}

interface CheckArgs {
  json: boolean;
  failOnMissing: boolean;
}

async function checkSandboxImages(args: CheckArgs): Promise<void> {
  const { json, failOnMissing } = args;

  const requiredImages = getRegisteredImages()
    .map((img) => img.imageId)
    .filter((id): id is SandboxImageId => id !== undefined);
  const requiredIds = requiredImages.map(formatSandboxImageId);

  const templatesResult = await listE2BTemplates();

  if (templatesResult.isErr()) {
    if (json) {
      logger.info({ result: { error: templatesResult.error.message } }, "");
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
    if (existingIds.has(id)) {
      existing.push(id);
    } else {
      missing.push(id);
    }
  }

  for (const imageId of requiredImages) {
    const formattedId = formatSandboxImageId(imageId);
    if (!existingIds.has(formattedId)) {
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
    logger.info({ result }, "");
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

yargs(hideBin(process.argv))
  .option("json", {
    type: "boolean",
    default: false,
    describe: "Output results as JSON",
  })
  .option("fail-on-missing", {
    type: "boolean",
    default: false,
    describe: "Exit with error code if images are missing",
  })
  .help("h")
  .alias("h", "help")
  .parseAsync()
  .then(async (args) => {
    await checkSandboxImages({
      json: args.json,
      failOnMissing: args["fail-on-missing"],
    });
  })
  .catch((error) => {
    logger.error({ err: error }, "An error occurred");
    process.exit(1);
  });
