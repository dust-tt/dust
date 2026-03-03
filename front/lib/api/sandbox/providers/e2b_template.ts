/**
 * E2B-specific template building.
 *
 * Uses the E2B SDK to build templates from our provider-agnostic Template class.
 * This is the only template-related file that imports from the E2B SDK.
 */

import config from "@app/lib/api/config";
import type { SandboxImage } from "@app/lib/api/sandbox/image";
import type {
  Operation,
  SandboxImageId,
} from "@app/lib/api/sandbox/image/types";
import { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { TemplateBuilder } from "e2b";
import { defaultBuildLogger, Template as E2BTemplate } from "e2b";

interface E2BBuildConfig {
  apiKey?: string;
  domain?: string;
  skipCache?: boolean;
}

function applyOperation(e2b: TemplateBuilder, op: Operation): TemplateBuilder {
  switch (op.type) {
    case "run":
      return e2b.runCmd(op.command);

    case "copy":
      return e2b.copy(op.src, op.dest);

    case "workdir":
      return e2b.setWorkdir(op.path);

    case "env":
      return e2b.setEnvs({ ...op.vars });

    default:
      return assertNever(op);
  }
}

function toE2BTemplate(image: SandboxImage): TemplateBuilder {
  const baseImage = image.baseImage;
  let e2b: TemplateBuilder;

  switch (baseImage.type) {
    case "ubuntu":
      e2b = E2BTemplate().fromUbuntuImage(baseImage.version);
      break;
    case "template":
      e2b = E2BTemplate().fromTemplate(formatSandboxImageId(baseImage.id));
      break;
    default:
      return assertNever(baseImage);
  }

  for (const op of image.operations) {
    e2b = applyOperation(e2b, op);
  }

  return e2b;
}

export async function buildSandboxImage(
  image: SandboxImage,
  imageId: SandboxImageId,
  buildConfig?: E2BBuildConfig
): Promise<Result<string, Error>> {
  const e2bConfig = config.getE2BSandboxConfig();

  const apiKey = buildConfig?.apiKey ?? e2bConfig.apiKey;
  const domain = buildConfig?.domain ?? e2bConfig.domain;

  logger.info(
    {
      imageName: imageId.imageName,
      tag: imageId.tag,
      domain,
      skipCache: buildConfig?.skipCache ?? false,
      cpuCount: image.resources.vcpu,
      memoryMB: image.resources.memoryMb,
      operationCount: image.operations.length,
      toolCount: image.tools.length,
    },
    "Building E2B sandbox image"
  );

  try {
    const e2bTemplate = toE2BTemplate(image);

    const result = await E2BTemplate.build(
      e2bTemplate,
      formatSandboxImageId(imageId),
      {
        cpuCount: image.resources.vcpu,
        memoryMB: image.resources.memoryMb,
        apiKey,
        ...(domain ? { domain } : {}),
        ...(buildConfig?.skipCache ? { skipCache: true } : {}),
        onBuildLogs: defaultBuildLogger(),
      }
    );

    logger.info(
      {
        templateId: result.templateId,
        requestedResources: {
          cpuCount: image.resources.vcpu,
          memoryMB: image.resources.memoryMb,
        },
      },
      "E2B sandbox image build completed - verify resources in E2B dashboard or use sandbox_image_list.ts"
    );

    return new Ok(result.templateId);
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        imageName: imageId.imageName,
        tag: imageId.tag,
      },
      "Failed to build E2B sandbox image"
    );
    return new Err(normalizeError(err));
  }
}
