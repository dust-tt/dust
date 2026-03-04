/**
 * E2B-specific template building.
 *
 * Uses the E2B SDK to build templates from our provider-agnostic Template class.
 * This is the only template-related file that imports from the E2B SDK.
 */

import config from "@app/lib/api/config";
import type { SandboxImage } from "@app/lib/api/sandbox/image";
import type {
  ContentGenerator,
  Operation,
  SandboxImageId,
  SandboxResources,
} from "@app/lib/api/sandbox/image/types";
import { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { TemplateBuilder } from "e2b";
import { defaultBuildLogger, Template as E2BTemplate } from "e2b";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type DockerRegistryFactory = (imageRef: string) => TemplateBuilder;

export function createGCPRegistryFactory(
  registry: string,
  serviceAccountPath: string
): DockerRegistryFactory {
  return (imageRef: string) =>
    E2BTemplate().fromGCPRegistry(`${registry}/${imageRef}`, {
      serviceAccountJSON: serviceAccountPath,
    });
}

interface E2BBuildConfig {
  apiKey?: string;
  domain?: string;
  skipCache?: boolean;
  dockerRegistryFactory?: DockerRegistryFactory;
}

class ContentMaterializer {
  private tempDir: string | null = null;
  private fileCount = 0;

  materializeToPath(getContent: ContentGenerator): string {
    if (!this.tempDir) {
      this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-build-"));
    }
    const tempFile = path.join(this.tempDir, `content-${this.fileCount++}`);
    fs.writeFileSync(tempFile, getContent());
    return tempFile;
  }

  cleanup(): void {
    if (this.tempDir) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }
}

interface E2BTemplateBuildOptions {
  apiKey: string;
  domain?: string;
  skipCache?: boolean;
  resources: SandboxResources;
}

class E2BTemplateBuilder {
  private builder: TemplateBuilder;
  private readonly materializer = new ContentMaterializer();

  private constructor(builder: TemplateBuilder) {
    this.builder = builder;
  }

  static fromSandboxImage(
    image: SandboxImage,
    options?: { dockerRegistryFactory?: DockerRegistryFactory }
  ): E2BTemplateBuilder {
    const baseImage = image.baseImage;
    let builder: TemplateBuilder;

    switch (baseImage.type) {
      case "ubuntu":
        builder = E2BTemplate().fromUbuntuImage(baseImage.version);
        break;
      case "template":
        builder = E2BTemplate().fromTemplate(
          formatSandboxImageId(baseImage.id)
        );
        break;
      case "docker":
        if (!options?.dockerRegistryFactory) {
          throw new Error("dockerRegistryFactory is required for docker images");
        }
        builder = options.dockerRegistryFactory(baseImage.imageRef);
        break;
      default:
        return assertNever(baseImage);
    }

    const e2bBuilder = new E2BTemplateBuilder(builder);

    for (const op of image.operations) {
      e2bBuilder.applyOperation(op);
    }

    return e2bBuilder;
  }

  private applyOperation(op: Operation): void {
    switch (op.type) {
      case "run":
        this.builder = this.builder.runCmd(op.command);
        break;

      case "copy":
        if (op.src.type === "path") {
          this.builder = this.builder.copy(op.src.path, op.dest);
        } else {
          const tempPath = this.materializer.materializeToPath(
            op.src.getContent
          );
          this.builder = this.builder.copy(tempPath, op.dest);
        }
        break;

      case "workdir":
        this.builder = this.builder.setWorkdir(op.path);
        break;

      case "env":
        this.builder = this.builder.setEnvs({ ...op.vars });
        break;

      default:
        assertNever(op);
    }
  }

  async build(
    imageId: SandboxImageId,
    options: E2BTemplateBuildOptions
  ): Promise<{ templateId: string }> {
    try {
      return await E2BTemplate.build(
        this.builder,
        formatSandboxImageId(imageId),
        {
          cpuCount: options.resources.vcpu,
          memoryMB: options.resources.memoryMb,
          apiKey: options.apiKey,
          ...(options.domain ? { domain: options.domain } : {}),
          ...(options.skipCache ? { skipCache: true } : {}),
          onBuildLogs: defaultBuildLogger(),
        }
      );
    } finally {
      this.materializer.cleanup();
    }
  }
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
    const e2bBuilder = E2BTemplateBuilder.fromSandboxImage(image, {
      dockerRegistryFactory: buildConfig?.dockerRegistryFactory,
    });

    const result = await e2bBuilder.build(imageId, {
      apiKey,
      domain,
      skipCache: buildConfig?.skipCache,
      resources: image.resources,
    });

    logger.info(
      {
        templateId: result.templateId,
        requestedResources: {
          cpuCount: image.resources.vcpu,
          memoryMB: image.resources.memoryMb,
        },
      },
      "E2B sandbox image build completed"
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
