// ---------------------------------------------------------------------------
// SandboxImage Name & Tag Types
// ---------------------------------------------------------------------------

const SANDBOX_IMAGE_NAMES = ["dust-base"] as const;
export type SandboxImageName = (typeof SANDBOX_IMAGE_NAMES)[number];

export function isValidSandboxImageName(
  name: string
): name is SandboxImageName {
  return SANDBOX_IMAGE_NAMES.includes(name as SandboxImageName);
}

export function getSandboxImageNames(): readonly SandboxImageName[] {
  return SANDBOX_IMAGE_NAMES;
}

const SANDBOX_IMAGE_TAGS = [
  "edge",
  "staging",
  "production",
  "v0.1.1",
  "v0.2.0",
] as const;
export type SandboxImageTag = (typeof SANDBOX_IMAGE_TAGS)[number];

export function isValidSandboxImageTag(tag: string): tag is SandboxImageTag {
  return SANDBOX_IMAGE_TAGS.includes(tag as SandboxImageTag);
}

export function getSandboxImageTags(): readonly SandboxImageTag[] {
  return SANDBOX_IMAGE_TAGS;
}

export interface SandboxImageId {
  readonly imageName: SandboxImageName;
  readonly tag: SandboxImageTag;
}

// TODO(@jd): Replace with a proper typed link to dust-base
export const DUST_SANDBOX_IMAGE_ID: SandboxImageId = {
  imageName: "dust-base",
  tag: "v0.2.0",
};

export function formatSandboxImageId(id: SandboxImageId): string {
  // E2B template IDs only allow lowercase alphanumeric characters and hyphens.
  return `${id.imageName}-${id.tag}`.replace(/[^a-z0-9-]/g, "-");
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
// Base Image
// ---------------------------------------------------------------------------

export type BaseImage =
  | { readonly type: "sandbox"; readonly id: SandboxImageId }
  | { readonly type: "docker"; readonly imageRef: string };
