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
// Tool Entry
// ---------------------------------------------------------------------------

export interface ToolEntry {
  readonly name: string;
  readonly description: string;
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
  | { readonly type: "run"; readonly command: string }
  | { readonly type: "copy"; readonly src: CopySource; readonly dest: string }
  | { readonly type: "workdir"; readonly path: string }
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
    "*.dust.tt",
    "pypi.org",
    "registry.npmjs.org",
    "github.com",
    "static.rust-lang.org",
    "crates.io",
    "static.crates.io",
    "index.crates.io",
  ],
};

// ---------------------------------------------------------------------------
// Tool Manifest
// ---------------------------------------------------------------------------

export interface ToolManifest {
  readonly version: "1.0";
  readonly generatedAt: string;
  readonly tools: readonly ToolEntry[];
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

export type BaseImage =
  | { readonly type: "sandbox"; readonly id: SandboxImageId }
  | { readonly type: "docker"; readonly imageRef: string };
