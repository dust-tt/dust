import {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image/tool_manifest";
import type {
  BaseImage,
  ContentGenerator,
  CopySource,
  ManifestFormat,
  NetworkPolicy,
  Operation,
  SandboxCapability,
  SandboxImageId,
  SandboxResources,
  ToolEntry,
} from "@app/lib/api/sandbox/image/types";

const DEFAULT_RESOURCES: SandboxResources = {
  vcpu: 1,
  memoryMb: 512,
};

const DEFAULT_NETWORK: NetworkPolicy = {
  mode: "deny_all",
};

interface SandboxImageState {
  baseImage: BaseImage;
  operations: readonly Operation[];
  tools: readonly ToolEntry[];
  resources: SandboxResources;
  network: NetworkPolicy;
  workdir: string;
  runEnv: Readonly<Record<string, string>>;
  capabilities: ReadonlySet<SandboxCapability>;
  imageId?: SandboxImageId;
}

export class SandboxImage {
  readonly baseImage: BaseImage;
  readonly operations: readonly Operation[];
  readonly tools: readonly ToolEntry[];
  readonly resources: SandboxResources;
  readonly network: NetworkPolicy;
  readonly workdir: string;
  readonly runEnv: Readonly<Record<string, string>>;
  readonly startupScript?: string;
  readonly capabilities: ReadonlySet<SandboxCapability>;
  readonly imageId?: SandboxImageId;

  private constructor(state: SandboxImageState) {
    this.baseImage = state.baseImage;
    this.operations = state.operations;
    this.tools = state.tools;
    this.resources = state.resources;
    this.network = state.network;
    this.workdir = state.workdir;
    this.runEnv = state.runEnv;
    this.capabilities = state.capabilities;
    this.imageId = state.imageId;
  }

  private clone(updates: Partial<SandboxImageState>): SandboxImage {
    return new SandboxImage({
      baseImage: updates.baseImage ?? this.baseImage,
      operations: updates.operations ?? this.operations,
      tools: updates.tools ?? this.tools,
      resources: updates.resources ?? this.resources,
      network: updates.network ?? this.network,
      workdir: updates.workdir ?? this.workdir,
      runEnv: updates.runEnv ?? this.runEnv,
      capabilities: updates.capabilities ?? this.capabilities,
      imageId: updates.imageId ?? this.imageId,
    });
  }

  static fromSandboxImage(image: SandboxImage): SandboxImage {
    return image.clone({});
  }

  static fromDocker(imageRef: string): SandboxImage {
    return new SandboxImage({
      baseImage: { type: "docker", imageRef },
      operations: [],
      tools: [],
      resources: DEFAULT_RESOURCES,
      network: DEFAULT_NETWORK,
      workdir: "", // No default, set via setWorkdir in registry
      runEnv: {},
      capabilities: new Set(),
    });
  }

  runCmd(command: string, options?: { user?: string }): SandboxImage {
    const operation: Operation = {
      type: "run",
      command,
      user: options?.user,
    };

    return this.clone({
      operations: [...this.operations, operation],
    });
  }

  setUser(user: string): SandboxImage {
    const operation: Operation = {
      type: "user",
      user,
    };

    return this.clone({
      operations: [...this.operations, operation],
    });
  }

  registerTool(
    tools: ToolEntry | ToolEntry[],
    options?: { installCmd?: string }
  ): SandboxImage {
    const toolsArray = Array.isArray(tools) ? tools : [tools];

    const newOperations = options?.installCmd
      ? [
          ...this.operations,
          { type: "run" as const, command: options.installCmd },
        ]
      : this.operations;

    return this.clone({
      operations: newOperations,
      tools: [...this.tools, ...toolsArray],
    });
  }

  copy(src: string, dest: string, options?: { user?: string }): SandboxImage;
  copy(
    src: ContentGenerator,
    dest: string,
    options?: { user?: string }
  ): SandboxImage;
  copy(
    src: string | ContentGenerator,
    dest: string,
    options?: { user?: string }
  ): SandboxImage {
    const srcValue: CopySource =
      typeof src === "string"
        ? { type: "path", path: src }
        : { type: "content", getContent: src };

    const operation: Operation = {
      type: "copy",
      src: srcValue,
      dest,
      user: options?.user,
    };

    return this.clone({
      operations: [...this.operations, operation],
    });
  }

  setWorkdir(path: string): SandboxImage {
    const operation: Operation = {
      type: "workdir",
      path,
    };

    return this.clone({
      operations: [...this.operations, operation],
      workdir: path,
    });
  }

  setBuildEnv(vars: Record<string, string>): SandboxImage {
    const operation: Operation = {
      type: "env",
      vars,
    };

    return this.clone({
      operations: [...this.operations, operation],
    });
  }

  setRunEnv(vars: Record<string, string>): SandboxImage {
    return this.clone({
      runEnv: { ...this.runEnv, ...vars },
    });
  }

  withCapability(cap: SandboxCapability): SandboxImage {
    const next = new Set(this.capabilities);
    next.add(cap);
    return this.clone({ capabilities: next });
  }

  hasCapability(cap: SandboxCapability): boolean {
    return this.capabilities.has(cap);
  }

  withResources(resources: SandboxResources): SandboxImage {
    return this.clone({ resources });
  }

  withNetwork(policy: NetworkPolicy): SandboxImage {
    return this.clone({ network: policy });
  }

  register(opts: { imageName: string; tag: string }): SandboxImage {
    return this.clone({
      imageId: { imageName: opts.imageName, tag: opts.tag },
    });
  }

  withToolManifest(options?: {
    path?: string;
    format?: ManifestFormat;
  }): SandboxImage {
    const format = options?.format ?? "yaml";
    const extension = format === "yaml" ? "yaml" : "json";
    const destPath =
      options?.path ?? `${this.workdir}/tool-manifest.${extension}`;

    const tools = this.tools;
    const getContent = (): string => {
      const manifest = createToolManifest(tools);
      return format === "yaml"
        ? toolManifestToYAML(manifest)
        : toolManifestToJSON(manifest);
    };

    return this.copy(getContent, destPath);
  }

  toCreateConfig(): {
    imageId: SandboxImageId;
    envVars?: Record<string, string>;
    network: NetworkPolicy;
    resources: SandboxResources;
  } {
    if (!this.imageId) {
      throw new Error(
        "Cannot create config from unregistered SandboxImage. Call .register() first."
      );
    }
    return {
      imageId: this.imageId,
      envVars:
        Object.keys(this.runEnv).length > 0 ? { ...this.runEnv } : undefined,
      network: this.network,
      resources: this.resources,
    };
  }
}
