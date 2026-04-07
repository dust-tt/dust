// ---------------------------------------------------------------------------
// SandboxImage Id
// ---------------------------------------------------------------------------

export interface SandboxImageId {
  readonly imageName: string;
  readonly tag: string;
}

export function formatSandboxImageId(id: SandboxImageId): string {
  // E2B template IDs only allow lowercase alphanumeric characters and hyphens.
  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${sanitize(id.imageName)}_${sanitize(id.tag)}`;
}

// ---------------------------------------------------------------------------
// Tool Runtime & Profile
// ---------------------------------------------------------------------------

export const TOOL_RUNTIMES = ["system", "python", "node"] as const;
export type ToolRuntime = (typeof TOOL_RUNTIMES)[number];

export const TOOL_PROFILES = ["openai", "anthropic", "gemini"] as const;
export type ToolProfile = (typeof TOOL_PROFILES)[number];

// ---------------------------------------------------------------------------
// Tool Entry
// ---------------------------------------------------------------------------

export interface ToolEntry {
  readonly name: string;
  readonly version?: string;
  readonly description: string;
  readonly usage?: string;
  readonly returns?: string;
  readonly runtime: ToolRuntime;
  readonly profile?: ToolProfile;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export type ManifestFormat = "json" | "yaml";

export type ContentGenerator = () => Buffer | string;

export type CopySource =
  | { readonly type: "path"; readonly path: string }
  | { readonly type: "content"; readonly getContent: ContentGenerator };

export type Operation =
  | { readonly type: "run"; readonly command: string; readonly user?: string }
  | {
      readonly type: "copy";
      readonly src: CopySource;
      readonly dest: string;
      readonly user?: string;
    }
  | { readonly type: "workdir"; readonly path: string }
  | { readonly type: "user"; readonly user: string }
  | {
      readonly type: "env";
      readonly vars: Readonly<Record<string, string>>;
    };

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface SandboxResources {
  readonly vcpu: number;
  readonly memoryMb: number;
  readonly diskGb?: number;
}

// ---------------------------------------------------------------------------
// Network Policy
// ---------------------------------------------------------------------------

export type NetworkMode = "allow_all" | "deny_all";

export interface NetworkPolicy {
  readonly mode: NetworkMode;
  readonly allowlist?: readonly string[];
}

export const ALLOWLIST_NETWORK_POLICY: NetworkPolicy = {
  mode: "deny_all",
  allowlist: [
    "storage.googleapis.com",
    "dust.tt",
    "*.dust.tt",
    // Datadog EU — sandbox telemetry
    "http-intake.logs.datadoghq.eu",
    "api.datadoghq.eu",
  ],
};

// ---------------------------------------------------------------------------
// Tool Manifest
// ---------------------------------------------------------------------------

export interface ManifestToolEntry {
  readonly name: string;
  readonly version?: string;
  readonly description: string;
  readonly usage?: string;
  readonly returns?: string;
}

export interface ToolManifest {
  readonly version: "1.0";
  readonly generatedAt: string;
  readonly tools: Readonly<
    Partial<Record<ToolRuntime, readonly ManifestToolEntry[]>>
  >;
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Declarative tags describing what a sandbox template supports.
 * The Docker image must actually have the corresponding tooling installed. The capability tag tells
 * orchestration it is safe to attempt the feature.
 */
export type SandboxCapability = "gcsfuse";

// ---------------------------------------------------------------------------
// Base Image
// ---------------------------------------------------------------------------

export type BaseImage = { readonly type: "docker"; readonly imageRef: string };
