import type { BlaxelProvider, CreateSandboxOptions, SandboxInfo, SessionToken } from "./provider";

// In-memory provider for local dev and tests. Stands in for Blaxel until M0
// validates the substrate and the real provider is written. Deterministic
// (no real network, no real tokens) so the control plane can be exercised
// end-to-end offline.
export class FakeBlaxelProvider implements BlaxelProvider {
  private readonly sandboxes = new Map<string, SandboxInfo>();
  private seq = 0;
  private tokenSeq = 0;

  createSandbox(opts: CreateSandboxOptions): Promise<SandboxInfo> {
    // createIfNotExists: keyed by name so re-provisioning is idempotent.
    for (const info of this.sandboxes.values()) {
      if (info.sandboxId === `sbx-${opts.name}`) {
        return Promise.resolve(info);
      }
    }
    this.seq += 1;
    const sandboxId = `sbx-${opts.name}`;
    const info: SandboxInfo = {
      sandboxId,
      previewUrl: `https://${opts.name}-${this.seq}.preview.bl.run`,
      awake: true,
    };
    this.sandboxes.set(sandboxId, info);
    return Promise.resolve(info);
  }

  bootBee(_sandboxId: string, _beeName: string): Promise<void> {
    return Promise.resolve();
  }

  getSandbox(sandboxId: string): Promise<SandboxInfo | null> {
    return Promise.resolve(this.sandboxes.get(sandboxId) ?? null);
  }

  deleteSandbox(sandboxId: string): Promise<void> {
    this.sandboxes.delete(sandboxId);
    return Promise.resolve();
  }

  mintSessionToken(sandboxId: string): Promise<SessionToken> {
    this.tokenSeq += 1;
    return Promise.resolve({
      token: `fake-session-${sandboxId}-${this.tokenSeq}`,
      // 1h horizon; callers should treat as opaque.
      expiresAtMs: 0,
    });
  }

  mintPreviewToken(sandboxId: string): Promise<SessionToken> {
    this.tokenSeq += 1;
    return Promise.resolve({
      token: `fake-preview-${sandboxId}-${this.tokenSeq}`,
      expiresAtMs: 0,
    });
  }

  revokeTokens(_sandboxId: string): Promise<void> {
    return Promise.resolve();
  }
}
