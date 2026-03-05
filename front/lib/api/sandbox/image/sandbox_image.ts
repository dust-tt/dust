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
}

export class SandboxImage {
  readonly baseImage: BaseImage;
  readonly operations: readonly Operation[];
  readonly tools: readonly ToolEntry[];
  readonly resources: SandboxResources;
  readonly network: NetworkPolicy;
  readonly workdir: string;
  readonly startupScript?: string;

  private constructor(state: SandboxImageState) {
    this.baseImage = state.baseImage;
    this.operations = state.operations;
    this.tools = state.tools;
    this.resources = state.resources;
    this.network = state.network;
    this.workdir = state.workdir;
  }

  private clone(updates: Partial<SandboxImageState>): SandboxImage {
    return new SandboxImage({
      baseImage: updates.baseImage ?? this.baseImage,
      operations: updates.operations ?? this.operations,
      tools: updates.tools ?? this.tools,
      resources: updates.resources ?? this.resources,
      network: updates.network ?? this.network,
      workdir: updates.workdir ?? this.workdir,
    });
  }

  static fromUbuntu(version: string = "22.04"): SandboxImage {
    return new SandboxImage({
      baseImage: { type: "ubuntu", version },
      operations: [],
      tools: [],
      resources: DEFAULT_RESOURCES,
      network: DEFAULT_NETWORK,
      workdir: "/home/user",
    });
  }

  static fromTemplate(id: SandboxImageId): SandboxImage {
    return new SandboxImage({
      baseImage: { type: "template", id },
      operations: [],
      tools: [],
      resources: DEFAULT_RESOURCES,
      network: DEFAULT_NETWORK,
      workdir: "/home/user",
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

  setEnv(vars: Record<string, string>): SandboxImage {
    const operation: Operation = {
      type: "env",
      vars,
    };

    return this.clone({
      operations: [...this.operations, operation],
    });
  }

  withResources(resources: SandboxResources): SandboxImage {
    return this.clone({ resources });
  }

  withNetwork(policy: NetworkPolicy): SandboxImage {
    return this.clone({ network: policy });
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
}
