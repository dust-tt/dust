import { SandboxInstance } from "@blaxel/core";
import type { BlaxelProvider, CreateSandboxOptions, SandboxInfo, SessionToken } from "./provider";

// The in-bee proxy (dust-hive front, base 10000) is what the preview URL fronts.
const BEE_PROXY_PORT = 10000;
const PREVIEW_NAME = "front";

// Detached warm process: named so we can poll it, and given generous headroom
// over the ~80s first-warm on a cold bee.
const BOOT_PROCESS_NAME = "bee-init-warm";
const BOOT_MAX_WAIT_MS = 300_000;

// Preview URLs are populated asynchronously after create.
const PREVIEW_URL_TIMEOUT_MS = 30_000;
const PREVIEW_URL_POLL_MS = 500;

// Preview tokens are short-lived; connect is the (re)mint point on resume.
const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface BlaxelProviderConfig {
  // Custom warm base image baked with the dust-hive worktree + prebuilt deps.
  image: string;
  memoryMb: number;
  // Where the dust repo is baked in the image (bee-init/warm run here).
  repoPath: string;
}

// Real Blaxel-backed provider. Authentication is read from the environment by
// the @blaxel/core SDK (BL_API_KEY / BL_WORKSPACE). All Blaxel coupling lives
// in this file (Risk #7) — the control plane only sees the BlaxelProvider
// interface, so the bee contract can be re-pointed at another provider later.
export class BlaxelSandboxProvider implements BlaxelProvider {
  constructor(private readonly config: BlaxelProviderConfig) {}

  async createSandbox(opts: CreateSandboxOptions): Promise<SandboxInfo> {
    const sandbox = await SandboxInstance.createIfNotExists({
      name: opts.name,
      image: this.config.image,
      region: opts.region,
      memory: this.config.memoryMb,
      // Expose the in-bee proxy; the preview below makes it reachable.
      ports: [{ protocol: "HTTP", target: BEE_PROXY_PORT }],
      // Scale-to-zero snapshots full state — our pause/wake.
      snapshotEnabled: true,
    });
    const previewUrl = await this.ensurePreviewUrl(sandbox);
    return { sandboxId: opts.name, previewUrl, awake: isAwake(sandbox) };
  }

  async bootBee(sandboxId: string, beeName: string): Promise<void> {
    const sandbox = await SandboxInstance.get(sandboxId);
    // beeName is validated (^[a-z][a-z0-9-]*$), so it is safe to interpolate.
    // `dust-hive` is on PATH in the warm base image. bee-init registers the
    // baked checkout as a single-tenant env and --warm starts all services.
    //
    // Warm takes ~80s on first boot, longer than the 60s cap Blaxel enforces on
    // `waitForCompletion`, so we start the process detached and poll
    // `process.wait` instead. `keepAlive` disables scale-to-zero for the
    // duration: the warm makes no inbound connections while it compiles/inits,
    // so the sandbox would otherwise standby out from under it (`timeout: 0`
    // only disables the process auto-kill, not standby).
    const started = await sandbox.process.exec({
      name: BOOT_PROCESS_NAME,
      command: `dust-hive bee-init ${beeName} --warm`,
      workingDir: this.config.repoPath,
      keepAlive: true,
      timeout: 0,
    });
    const result = await sandbox.process.wait(started.name, { maxWait: BOOT_MAX_WAIT_MS });
    if (result.status !== "completed" || result.exitCode !== 0) {
      throw new Error(
        `bee-init --warm did not complete (status=${result.status}, exitCode=${result.exitCode})`
      );
    }
  }

  async getSandbox(sandboxId: string): Promise<SandboxInfo | null> {
    const sandbox = await getSandboxOrNull(sandboxId);
    if (!sandbox) {
      return null;
    }
    const previewUrl = await this.ensurePreviewUrl(sandbox);
    return { sandboxId, previewUrl, awake: isAwake(sandbox) };
  }

  async deleteSandbox(sandboxId: string): Promise<void> {
    await SandboxInstance.delete(sandboxId);
  }

  async mintSessionToken(sandboxId: string): Promise<SessionToken> {
    const sandbox = await SandboxInstance.get(sandboxId);
    // Short-lived by design: connect is the (re)mint point on resume.
    const session = await sandbox.sessions.create();
    return { token: session.token, expiresAtMs: new Date(session.expiresAt).getTime() };
  }

  async mintPreviewToken(sandboxId: string): Promise<SessionToken> {
    const sandbox = await SandboxInstance.get(sandboxId);
    // Token scoped to the FRONT preview (port 10000) — this authenticates the
    // preview URL itself. The exec session token (above) does not.
    const preview = await sandbox.previews.get(PREVIEW_NAME);
    const token = await preview.tokens.create(new Date(Date.now() + PREVIEW_TOKEN_TTL_MS));
    return { token: token.value, expiresAtMs: new Date(token.expiresAt).getTime() };
  }

  async revokeTokens(sandboxId: string): Promise<void> {
    const sandbox = await getSandboxOrNull(sandboxId);
    if (!sandbox) {
      return;
    }
    const sessions = await sandbox.sessions.list();
    for (const session of sessions) {
      await sandbox.sessions.delete(session.name);
    }
  }

  // Ensure an authenticated preview on the proxy port and return its URL.
  private async ensurePreviewUrl(sandbox: SandboxInstance): Promise<string> {
    const preview = await sandbox.previews.createIfNotExists({
      metadata: { name: PREVIEW_NAME },
      // Not public — reachable only with a preview token (Security baseline).
      spec: { port: BEE_PROXY_PORT, public: false },
    });
    if (preview.spec.url) {
      return preview.spec.url;
    }
    // spec.url is populated asynchronously after create; re-fetch until it lands.
    const start = Date.now();
    while (Date.now() - start < PREVIEW_URL_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_URL_POLL_MS));
      const refreshed = await sandbox.previews.get(PREVIEW_NAME);
      if (refreshed.spec.url) {
        return refreshed.spec.url;
      }
    }
    throw new Error("Blaxel preview did not expose a URL in time");
  }
}

function isAwake(sandbox: SandboxInstance): boolean {
  return sandbox.status === "DEPLOYED";
}

// SandboxInstance.get throws when the sandbox does not exist; the control plane
// wants a null instead so it can distinguish "gone" from a real error.
async function getSandboxOrNull(sandboxId: string): Promise<SandboxInstance | null> {
  try {
    return await SandboxInstance.get(sandboxId);
  } catch {
    return null;
  }
}
