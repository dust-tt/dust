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
import {
  ApiClient,
  ConnectionConfig,
  defaultBuildLogger,
  Template as E2BTemplate,
} from "e2b";
import * as fs from "fs";
import * as path from "path";

export type DockerRegistryFactory = (imageRef: string) => TemplateBuilder;

export function createGCPRegistryFactory(
  registry: string,
  serviceAccountPath: string
): DockerRegistryFactory {
  const absolutePath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.resolve(process.cwd(), serviceAccountPath);
  // E2B SDK uses path.join internally which breaks absolute paths.
  // Compute relative path from this file's directory so E2B resolves correctly.
  const relativePath = path.relative(__dirname, absolutePath);

  return (imageRef: string) =>
    E2BTemplate().fromGCPRegistry(`${registry}/${imageRef}`, {
      serviceAccountJSON: relativePath,
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

  materializeToPath(
    getContent: ContentGenerator,
    destFileName: string
  ): string {
    if (!this.tempDir) {
      // Create temp dir relative to this module (E2B resolves paths from __dirname).
      const uniqueId = `sandbox-build-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.tempDir = path.join(__dirname, uniqueId);
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    // Use a subdirectory per file so E2B's directory-based copy works correctly.
    const contentDir = path.join(this.tempDir, `content-${this.fileCount++}`);
    fs.mkdirSync(contentDir, { recursive: true });
    const fileName = path.basename(destFileName);
    const tempFile = path.join(contentDir, fileName);
    fs.writeFileSync(tempFile, getContent());
    return path.relative(__dirname, contentDir);
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
    options: { dockerRegistryFactory: DockerRegistryFactory }
  ): E2BTemplateBuilder {
    const builder = options.dockerRegistryFactory(image.baseImage.imageRef);
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
          // E2B copy works with directories, so we create a temp dir containing
          // a file with the destination's filename, then copy to dest's parent.
          const tempDir = this.materializer.materializeToPath(
            op.src.getContent,
            op.dest
          );
          const destDir = path.dirname(op.dest);
          this.builder = this.builder.copy(tempDir, destDir);
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

export interface E2BTemplateInfo {
  templateId: string;
  aliases: readonly string[];
}

export async function listE2BTemplates(
  apiKey?: string
): Promise<Result<E2BTemplateInfo[], Error>> {
  const e2bConfig = config.getE2BSandboxConfig();
  const key = apiKey ?? e2bConfig.apiKey;
  const domain = e2bConfig.domain;

  try {
    const connectionConfig = new ConnectionConfig({
      apiKey: key,
      ...(domain ? { domain } : {}),
    });
    const client = new ApiClient(connectionConfig, { requireApiKey: true });

    const response = await client.api.GET("/templates");

    if (response.error) {
      throw new Error(`E2B API error: ${JSON.stringify(response.error)}`);
    }

    const templates = response.data ?? [];
    return new Ok(
      templates.map((t) => ({
        templateId: t.templateID,
        aliases: t.aliases ?? [],
      }))
    );
  } catch (err) {
    logger.error({ err: normalizeError(err) }, "Failed to list E2B templates");
    return new Err(normalizeError(err));
  }
}

export async function templateExists(
  imageId: SandboxImageId,
  apiKey?: string
): Promise<Result<boolean, Error>> {
  const templatesResult = await listE2BTemplates(apiKey);
  if (templatesResult.isErr()) {
    return templatesResult;
  }

  const expectedAlias = formatSandboxImageId(imageId);
  const exists = templatesResult.value.some((template) =>
    template.aliases.includes(expectedAlias)
  );

  return new Ok(exists);
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

  if (!buildConfig?.dockerRegistryFactory) {
    return new Err(
      new Error("dockerRegistryFactory is required to build sandbox images")
    );
  }

  try {
    const e2bBuilder = E2BTemplateBuilder.fromSandboxImage(image, {
      dockerRegistryFactory: buildConfig.dockerRegistryFactory,
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
