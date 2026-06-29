import type { Identity } from "./auth";
import type { BlaxelProvider, SandboxInfo } from "./blaxel/provider";
import {
  conflict,
  Err,
  internalError,
  invalidRequest,
  normalizeError,
  notFound,
  Ok,
  type Result,
} from "./result";
import type { BeeStore } from "./store";
import { type Bee, validateBeeName } from "./types";

export interface ProvisionRequest {
  name: string;
  scenario?: string | undefined;
}

export interface ConnectResult {
  // Authenticates the preview URL (front, port 10000) — what the client opens.
  previewToken: string;
  // Authenticates the exec/attach surface (tmux + in-bee agent).
  sessionToken: string;
  previewUrl: string;
  sandboxId: string;
}

export interface ReadyResult {
  ready: boolean;
}

interface ControlPlaneDeps {
  store: BeeStore;
  provider: BlaxelProvider;
  region: string;
  // Injectable for deterministic tests.
  now?: () => string;
  genId?: () => string;
}

export class ControlPlane {
  private readonly store: BeeStore;
  private readonly provider: BlaxelProvider;
  private readonly region: string;
  private readonly now: () => string;
  private readonly genId: () => string;

  constructor(deps: ControlPlaneDeps) {
    this.store = deps.store;
    this.provider = deps.provider;
    this.region = deps.region;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.genId = deps.genId ?? (() => `bee_${crypto.randomUUID()}`);
  }

  // Every per-bee call enforces ownership. A bee owned by someone else is
  // reported as not_found so existence is never leaked across owners.
  private async requireOwnedBee(identity: Identity, id: string): Promise<Result<Bee>> {
    const bee = await this.store.get(id);
    if (!bee || bee.owner !== identity.id) {
      return Err(notFound(`Bee '${id}' not found`));
    }
    return Ok(bee);
  }

  // GET /bees — the caller's fleet.
  async listBees(identity: Identity): Promise<Result<Bee[]>> {
    const all = await this.store.list();
    return Ok(all.filter((b) => b.owner === identity.id));
  }

  // GET /bees/:id
  getBee(identity: Identity, id: string): Promise<Result<Bee>> {
    return this.requireOwnedBee(identity, id);
  }

  // POST /bees — provision: register, then create the sandbox from the warm
  // image (createIfNotExists), then mark ready with its preview URL.
  async provisionBee(identity: Identity, req: ProvisionRequest): Promise<Result<Bee>> {
    const validation = validateBeeName(req.name);
    if (!validation.valid) {
      return Err(invalidRequest(validation.error ?? "Invalid bee name"));
    }

    const owned = await this.listBees(identity);
    if (owned.ok && owned.value.some((b) => b.name === req.name)) {
      return Err(conflict(`You already own a bee named '${req.name}'`));
    }

    const bee: Bee = {
      id: this.genId(),
      name: req.name,
      owner: identity.id,
      sandboxId: null,
      previewUrl: null,
      hostState: "provisioning",
      ...(req.scenario ? { scenario: req.scenario } : {}),
      createdAt: this.now(),
    };
    await this.store.save(bee);

    // createSandbox/bootBee are external (Blaxel SDK) and throw. If either fails
    // the bee would otherwise be stranded `provisioning` with its name locked
    // (409 on retry). Roll back: delete the sandbox if it was created, drop the
    // record so the name frees up and a retry is clean.
    let sandbox: SandboxInfo;
    let createdSandboxId: string | null = null;
    try {
      sandbox = await this.provider.createSandbox({ name: req.name, region: this.region });
      createdSandboxId = sandbox.sandboxId;
      await this.provider.bootBee(sandbox.sandboxId, req.name);
    } catch (err) {
      await this.rollbackProvision(bee, createdSandboxId);
      return Err(
        internalError(`Failed to provision bee '${req.name}': ${normalizeError(err).message}`)
      );
    }

    const ready: Bee = {
      ...bee,
      sandboxId: sandbox.sandboxId,
      previewUrl: sandbox.previewUrl,
      hostState: "ready",
    };
    await this.store.save(ready);
    return Ok(ready);
  }

  // Undo a failed provision: delete the sandbox if one was created, then drop
  // the registry record so the name is free to retry.
  private async rollbackProvision(bee: Bee, sandboxId: string | null): Promise<void> {
    if (sandboxId) {
      await this.provider.deleteSandbox(sandboxId);
    }
    await this.store.delete(bee.id);
  }

  // POST /bees/:id/connect — mint a short-lived session token, (re)inject
  // per-user creds, return the preview URL. Narrow on purpose: readiness and
  // keepalive are separate so a second client need not reconnect to poll.
  async connect(identity: Identity, id: string): Promise<Result<ConnectResult>> {
    const owned = await this.requireOwnedBee(identity, id);
    if (!owned.ok) {
      return owned;
    }
    const bee = owned.value;
    if (bee.hostState !== "ready" || !bee.sandboxId || !bee.previewUrl) {
      return Err(invalidRequest(`Bee '${bee.name}' is not ready to connect (${bee.hostState})`));
    }

    // TODO(M3): (re)inject fresh short-lived per-user creds here — model-API
    // egress substitution and the git credential helper. A bee resumed hours
    // later has expired tokens, so connect is the refresh point.

    // Two surfaces, two tokens: the preview token authenticates the front
    // preview URL the client opens; the session token authenticates exec/attach.
    const previewToken = await this.provider.mintPreviewToken(bee.sandboxId);
    const sessionToken = await this.provider.mintSessionToken(bee.sandboxId);
    return Ok({
      previewToken: previewToken.token,
      sessionToken: sessionToken.token,
      previewUrl: bee.previewUrl,
      sandboxId: bee.sandboxId,
    });
  }

  // GET /bees/:id/ready — readiness gate after a resume, split out of connect.
  async ready(identity: Identity, id: string): Promise<Result<ReadyResult>> {
    const owned = await this.requireOwnedBee(identity, id);
    if (!owned.ok) {
      return owned;
    }
    const bee = owned.value;
    if (!bee.sandboxId) {
      return Ok({ ready: false });
    }
    // TODO(M2): replace with a real in-bee health probe (front serving
    // requests post-resume), not merely "sandbox awake".
    const sandbox = await this.provider.getSandbox(bee.sandboxId);
    return Ok({ ready: Boolean(sandbox?.awake) && bee.hostState === "ready" });
  }

  // DELETE /bees/:id — reclaim: revoke all minted tokens, delete the sandbox
  // (confirming snapshot wipe), then drop the registry record.
  async reclaim(identity: Identity, id: string): Promise<Result<void>> {
    const owned = await this.requireOwnedBee(identity, id);
    if (!owned.ok) {
      return owned;
    }
    const bee = owned.value;
    if (bee.sandboxId) {
      await this.provider.revokeTokens(bee.sandboxId);
      await this.provider.deleteSandbox(bee.sandboxId);
    }
    await this.store.delete(bee.id);
    return Ok(undefined);
  }
}
