import {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "./tool_manifest";
import type {
  BaseImage,
  ContentGenerator,
  CopySource,
  ManifestFormat,
  NetworkPolicy,
  Operation,
  SandboxImageId,
  SandboxResources,
  ToolEntry,
} from "./types";

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
  readonly imageId?: SandboxImageId;

  private constructor(state: SandboxImageState) {
    this.baseImage = state.baseImage;
    this.operations = state.operations;
    this.tools = state.tools;
    this.resources = state.resources;
    this.network = state.network;
    this.workdir = state.workdir;
    this.runEnv = state.runEnv;
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
      imageId: updates.imageId ?? this.imageId,
    });
  }

  static fromSandbox(id: SandboxImageId): SandboxImage {
    return new SandboxImage({
      baseImage: { type: "sandbox", id },
      operations: [],
      tools: [],
      resources: DEFAULT_RESOURCES,
      network: DEFAULT_NETWORK,
      workdir: "/home/user",
      runEnv: {},
    });
  }

  static fromDocker(imageRef: string): SandboxImage {
    return new SandboxImage({
      baseImage: { type: "docker", imageRef },
      operations: [],
      tools: [],
      resources: DEFAULT_RESOURCES,
      network: DEFAULT_NETWORK,
      workdir: "/home/user",
      runEnv: {},
    });
  }

  runCmd(command: string): SandboxImage {
    const operation: Operation = {
      type: "run",
      command,
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

  copy(src: string, dest: string): SandboxImage;
  copy(src: ContentGenerator, dest: string): SandboxImage;
  copy(src: string | ContentGenerator, dest: string): SandboxImage {
    const srcValue: CopySource =
      typeof src === "string"
        ? { type: "path", path: src }
        : { type: "content", getContent: src };

    const operation: Operation = {
      type: "copy",
      src: srcValue,
      dest,
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

  withResources(resources: SandboxResources): SandboxImage {
    return this.clone({ resources });
  }

  withNetwork(policy: NetworkPolicy): SandboxImage {
    return this.clone({ network: policy });
  }

  register(imageId: SandboxImageId): SandboxImage {
    return this.clone({ imageId });
  }

  withToolManifest(options?: {
    path?: string;
    format?: ManifestFormat;
  }): SandboxImage {
    const format = options?.format ?? "yaml";
    const extension = format === "yaml" ? "yaml" : "json";
    const destPath =
      options?.path ?? `${this.workdir}/tool-manifest.${extension}`;

    // Capture tools at call time, generate content lazily
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
    imageId?: SandboxImageId;
    envVars?: Record<string, string>;
    network: NetworkPolicy;
    resources: SandboxResources;
  } {
    return {
      imageId: this.imageId,
      envVars:
        Object.keys(this.runEnv).length > 0 ? { ...this.runEnv } : undefined,
      network: this.network,
      resources: this.resources,
    };
  }
}
