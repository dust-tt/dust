// ---------------------------------------------------------------------------
// SandboxImage Name & Tag Types
// ---------------------------------------------------------------------------

export type SandboxImageName = "dust-base";

const SANDBOX_IMAGE_NAMES: readonly SandboxImageName[] = ["dust-base"];

export function isValidSandboxImageName(
  name: string
): name is SandboxImageName {
  return SANDBOX_IMAGE_NAMES.includes(name as SandboxImageName);
}

export function getSandboxImageNames(): readonly SandboxImageName[] {
  return SANDBOX_IMAGE_NAMES;
}

export type SandboxImageTag = "edge" | "staging" | "production";

const SANDBOX_IMAGE_TAGS: readonly SandboxImageTag[] = [
  "edge",
  "staging",
  "production",
];

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
  tag: "production",
};

export function formatSandboxImageId(id: SandboxImageId): string {
  return `${id.imageName}_${id.tag}`;
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
  | { readonly type: "ubuntu"; readonly version: string }
  | { readonly type: "template"; readonly id: SandboxImageId }
  | { readonly type: "docker"; readonly imageRef: string };
