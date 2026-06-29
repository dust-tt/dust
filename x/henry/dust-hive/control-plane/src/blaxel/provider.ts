// All Blaxel-specific calls live behind this interface (Risk #7): the bee
// contract can be re-pointed at another sandbox provider (e.g. Dust Sandbox)
// without changing the registry, control plane, or any client.

export interface SandboxInfo {
  sandboxId: string;
  // Authenticated Blaxel preview URL exposing the in-bee proxy (base 10000).
  previewUrl: string;
  // Blaxel active/standby, surfaced as informational status — the control
  // plane reports it but does not drive it (standby/resume are automatic).
  awake: boolean;
}

export interface SessionToken {
  token: string;
  // Short-lived: a bee resumed hours later has expired tokens, so `connect`
  // is the (re)mint point.
  expiresAtMs: number;
}

export interface CreateSandboxOptions {
  // createIfNotExists from the warm base image. Stable so re-provisioning an
  // existing sandbox is idempotent.
  name: string;
  region: string;
}

export interface BlaxelProvider {
  // Provision (POST /bees): createIfNotExists from the warm image.
  createSandbox(opts: CreateSandboxOptions): Promise<SandboxInfo>;
  // Boot dust-hive in bee mode inside the sandbox (bee-init + warm). Runs after
  // the sandbox is created, before the bee is marked ready. Not `up && spawn`.
  bootBee(sandboxId: string, beeName: string): Promise<void>;
  getSandbox(sandboxId: string): Promise<SandboxInfo | null>;
  // Reclaim (DELETE /bees/:id): delete + confirm snapshot wipe.
  deleteSandbox(sandboxId: string): Promise<void>;
  // Connect (POST /bees/:id/connect): mint a short-lived session token for the
  // exec/attach surface (tmux + in-bee agent).
  mintSessionToken(sandboxId: string): Promise<SessionToken>;
  // Connect: mint a short-lived token for the front preview URL (port 10000).
  // This — not the session token — is what authenticates the preview URL the
  // client opens; they are different Blaxel surfaces (preview vs exec session).
  mintPreviewToken(sandboxId: string): Promise<SessionToken>;
  // Revoke all minted tokens for a sandbox (part of reclaim).
  revokeTokens(sandboxId: string): Promise<void>;
}
