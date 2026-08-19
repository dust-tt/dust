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

// Builds outside CI publish under a per-developer alias instead of the release
// one. `sandbox_image_check.ts` reads "an alias with this tag exists" as "this
// version was built from main", so a locally built image sitting on the release
// alias makes CI skip that region's build and leaves the region running
// unmerged code. Both the build script and the dev-time image resolution go
// through here so the two always agree on the alias.
//
// No suffix means no local image to point at: the id is returned untouched so
// local runs use the release image built by CI. That is the common case.
export function devSandboxImageId(
  id: SandboxImageId,
  devSuffix: string | undefined
): SandboxImageId {
  if (!devSuffix) {
    return id;
  }

  return { ...id, tag: `${id.tag}-${devSuffix}` };
}

// ---------------------------------------------------------------------------
// Tool Names
// ---------------------------------------------------------------------------

// Hacky temporary: exported so the `dsbx` entry can be filtered out of the
// sandbox tool manifest by name when sandbox tools are off.
export const DSBX_TOOL_NAME = "dsbx";

// Stable UIDs of the service account and the untrusted workload account.
export const SANDBOX_AGENT_UID = 1002;
export const SANDBOX_AGENT_PROXIED_UID = 1003;

// Every non-root account reachable from a Front-triggered exec must stay
// behind the same DNS and TCP egress boundary. `agent` is included even
// though it only runs service commands: this keeps a future service-command
// compromise from bypassing the workload policy.
export const SANDBOX_EGRESS_CONTROLLED_UIDS = [
  SANDBOX_AGENT_UID,
  SANDBOX_AGENT_PROXIED_UID,
] as const;

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
  readonly isDustTool?: boolean;
  readonly profile?: ToolProfile | readonly ToolProfile[];
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export type ManifestFormat = "json" | "yaml";

export type ContentGenerator = () =>
  | Buffer
  | string
  | Map<string, Buffer | string>;

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

// Front-triggered non-root commands run as agent (uid 1002) or agent-proxied
// (uid 1003); both are redirected by nftables to the in-sandbox egress proxy.
// The E2B-level allowlist covers services that root processes access directly
// (bypassing the proxy).
export const PROXY_ONLY_NETWORK_POLICY: NetworkPolicy = {
  mode: "deny_all",
  allowlist: [
    // Dust API — the database filesystem daemon runs as root
    "dust.tt",
    // GCS — gcsfuse mounts run as root
    "storage.googleapis.com",
    // Datadog EU — sandbox telemetry runs as root
    "http-intake.logs.datadoghq.eu",
    "api.datadoghq.eu",
    // Regional egress proxy — the forwarder (root) connects by resolved IP,
    // but E2B's domain-based allowOut needs the wildcard too.
    "*.sandbox-egress.dust.tt",
    "104.199.4.80/32", // eu.sandbox-egress.dust.tt
    "104.154.146.142/32", // us.sandbox-egress.dust.tt
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
export type SandboxCapability = "dust_filesystem" | "gcsfuse";

// ---------------------------------------------------------------------------
// Base Image
// ---------------------------------------------------------------------------

export type BaseImage = { readonly type: "docker"; readonly imageRef: string };
