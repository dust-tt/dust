import config from "@app/lib/api/config";
import {
  formatSandboxImageId,
  getSandboxImageFromRegistry,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import {
  buildSandboxImage,
  createGCPRegistryFactory,
  templateExists,
} from "@app/lib/api/sandbox/providers/e2b_template";
import logger from "@app/logger/logger";
import * as fs from "fs";
import * as readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface BuildArgs {
  image: string;
  tag: string;
  skipCache: boolean;
  dockerRegistry: string;
  rebuild: boolean;
  confirm: boolean;
}

async function promptYesNo(question: string): Promise<boolean> {
  // Flush async logger (pino-pretty) before prompting
  await new Promise<void>((resolve) => logger.flush(() => resolve()));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    let answered = false;

    rl.on("close", () => {
      if (!answered) {
        process.exit(1);
      }
    });

    rl.question(`${question} [y/N] `, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

async function buildImage(args: BuildArgs): Promise<void> {
  const {
    image: imageName,
    tag,
    skipCache,
    dockerRegistry,
    rebuild,
    confirm,
  } = args;

  const imageId: SandboxImageId = { imageName, tag };

  logger.info({ imageName, tag }, "Starting sandbox image build");

  const existsResult = await templateExists(imageId);
  if (existsResult.isErr()) {
    logger.error(
      { err: existsResult.error },
      "Failed to check if template exists"
    );
    process.exit(1);
  }

  if (existsResult.value && !rebuild) {
    logger.error(
      { imageId: formatSandboxImageId(imageId) },
      "Template already exists in E2B. Use --rebuild to rebuild."
    );
    process.exit(1);
  }

  if (existsResult.value && rebuild && !confirm) {
    const confirmed = await promptYesNo(
      `Template ${formatSandboxImageId(imageId)} already exists. Rebuild?`
    );
    if (!confirmed) {
      return;
    }
  }

  const sandboxImageResult = getSandboxImageFromRegistry({ name: imageName });
  if (sandboxImageResult.isErr()) {
    logger.error({ imageName }, "Image not found in registry. Cannot proceed.");
    process.exit(1);
  }
  const sandboxImage = sandboxImageResult.value;

  logger.info(
    { imageName, tag },
    `Building E2B template '${formatSandboxImageId(imageId)}' from registry config`
  );

  const usesDockerBase = sandboxImage.baseImage.type === "docker";
  if (usesDockerBase && !dockerRegistry) {
    logger.error(
      { imageName },
      "Image uses Docker base. Please provide --docker-registry option or set SBX_GCP_ARTIFACT_REGISTRY env var"
    );
    process.exit(1);
  }

  const serviceAccountPath = config.getSandboxGcpArtifactServiceAccountPath();
  if (usesDockerBase && !serviceAccountPath) {
    logger.error(
      { imageName },
      "Image uses Docker base. Please set SBX_GCP_ARTIFACT_SERVICE_ACCOUNT env var to the path of your GCP service account JSON file"
    );
    process.exit(1);
  }

  if (usesDockerBase && serviceAccountPath) {
    if (!fs.existsSync(serviceAccountPath)) {
      logger.error({ serviceAccountPath }, "Service account file not found");
      process.exit(1);
    }
    const stat = fs.statSync(serviceAccountPath);
    if (!stat.isFile()) {
      logger.error(
        { serviceAccountPath },
        "SBX_GCP_ARTIFACT_SERVICE_ACCOUNT must point to a file, not a directory"
      );
      process.exit(1);
    }
  }

  logger.info(
    {
      imageName,
      tag,
      usesDockerBase,
      dockerRegistry: usesDockerBase ? dockerRegistry : "N/A",
    },
    "Building sandbox image"
  );

  const dockerRegistryFactory =
    usesDockerBase && serviceAccountPath
      ? createGCPRegistryFactory(dockerRegistry, serviceAccountPath)
      : undefined;

  const result = await buildSandboxImage(sandboxImage, imageId, {
    skipCache,
    dockerRegistryFactory,
  });

  if (result.isErr()) {
    process.exit(1);
  }

  logger.info(
    { templateId: result.value, imageName, tag },
    "Sandbox image built successfully"
  );
}

function getDockerRegistry(cliValue: string | undefined): string {
  if (cliValue) {
    return cliValue;
  }
  return config.getSandboxGcpArtifactRegistry() ?? "";
}

yargs(hideBin(process.argv))
  .option("image", {
    type: "string",
    demandOption: true,
    describe: "Image name (e.g., dust-base)",
  })
  .option("tag", {
    type: "string",
    demandOption: true,
    describe: "E2B image tag (e.g., production, staging)",
  })
  .option("skip-cache", {
    type: "boolean",
    default: false,
    describe: "Force rebuild without using cache",
  })
  .option("docker-registry", {
    type: "string",
    describe:
      "Docker registry URL (fallback: SBX_GCP_ARTIFACT_REGISTRY env var)",
  })
  .option("rebuild", {
    type: "boolean",
    default: false,
    describe:
      "Rebuild even if template exists in E2B (prompts for confirmation unless --confirm)",
  })
  .option("confirm", {
    type: "boolean",
    default: false,
    describe: "Skip all interactive prompts",
  })
  .help("h")
  .alias("h", "help")
  .parseAsync()
  .then(async (args) => {
    await buildImage({
      image: args.image,
      tag: args.tag,
      skipCache: args["skip-cache"],
      dockerRegistry: getDockerRegistry(args["docker-registry"]),
      rebuild: args.rebuild,
      confirm: args.confirm,
    });
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, "An error occurred");
    process.exit(1);
  });
