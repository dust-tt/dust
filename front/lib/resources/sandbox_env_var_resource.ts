import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { SandboxEnvVarScope } from "@app/lib/api/sandbox/env_vars";
import {
  areAllowedDomainsEqual,
  MAX_VARS_PER_POD,
  MAX_VARS_PER_WORKSPACE,
  normalizeAllowedDomainsForKind,
  renderEgressSecretPlaceholder,
  renderSandboxEnvVarName,
  scopeEncryptionKey,
  validateEnvVarName,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type {
  SandboxEnvVarKind,
  SandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { randomBytes } from "crypto";
import type { Attributes, Includeable, Transaction } from "sequelize";
import { Op, UniqueConstraintError } from "sequelize";

export type DeleteSandboxEnvVarResponseBody = {
  success: true;
};

export type PatchSandboxEnvVarResponseBody = {
  envVar: SandboxEnvVarType;
};

// An https_secret row with its secret material present. The columns are
// nullable at the table level (config rows have neither), so egress-path
// readers narrow through `isHttpsSecretWithMaterial` instead of re-checking
// each field.
export type HttpsSecretSandboxEnvVar = SandboxEnvVarResource & {
  placeholderNonce: Buffer;
  allowedDomains: string[];
};

const USER_JOIN_INCLUDES: Includeable[] = [
  {
    association: "createdByUser",
    attributes: ["name"],
    required: false,
  },
  {
    association: "lastUpdatedByUser",
    attributes: ["name"],
    required: false,
  },
];

function formatAllowedDomainsForAudit(
  allowedDomains: string[] | null | undefined
): string {
  return JSON.stringify(allowedDomains ?? []);
}

// One resource for both sandbox env var scopes. A row's scope is its
// `spaceId`: NULL = workspace-scoped, set = pod-scoped (pods are project
// spaces). Values are encrypted under the scope key — workspace sId or pod
// space sId — derived from the same `SandboxEnvVarScope` object that scopes
// every query, so key and row scope cannot diverge.
//
// Pod-scoped rows would break if a pod ever moved across workspaces with a
// workspace-derived key; hence the per-scope key, NOT the workspace sId.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxEnvVarResource
  extends ReadonlyAttributesType<SandboxEnvVarModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxEnvVarResource extends BaseResource<SandboxEnvVarModel> {
  static model: ModelStaticWorkspaceAware<SandboxEnvVarModel> =
    SandboxEnvVarModel;

  private readonly createdByName: string | null;
  private readonly lastUpdatedByName: string | null;

  constructor(
    _model: ModelStaticWorkspaceAware<SandboxEnvVarModel>,
    blob: Attributes<SandboxEnvVarModel>,
    metadata?: {
      createdByName: string | null;
      lastUpdatedByName: string | null;
    }
  ) {
    super(SandboxEnvVarModel, blob);
    this.createdByName = metadata?.createdByName ?? null;
    this.lastUpdatedByName = metadata?.lastUpdatedByName ?? null;
  }

  get sId(): string {
    return makeSId("sandbox_env_var", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // The wire-format name (composed prefix + suffix), e.g. `DST_FOO` or
  // `DSEC_FOO`. The DB column `name` stores the suffix only.
  get envName(): string {
    return renderSandboxEnvVarName({
      kind: this.kind,
      name: this.name,
    });
  }

  // ── Scope helpers ──────────────────────────────────────────────────────

  // Also pins the scope to the authenticated workspace: the encryption key
  // derives from the caller's scope object while queries filter on `auth`,
  // so a foreign scope would encrypt rows under a key this workspace cannot
  // decrypt.
  private static assertScope(auth: Authenticator, scope: SandboxEnvVarScope) {
    const workspaceId = auth.getNonNullableWorkspace().id;
    if (scope.kind === "pod") {
      assert(
        scope.pod.isProject(),
        "Only pod spaces can have sandbox environment variables."
      );
      assert(
        scope.pod.workspaceId === workspaceId,
        "Scope does not belong to the authenticated workspace."
      );
    } else {
      assert(
        scope.workspace.id === workspaceId,
        "Scope does not belong to the authenticated workspace."
      );
    }
  }

  private static scopeWhere(auth: Authenticator, scope: SandboxEnvVarScope) {
    return {
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: scope.kind === "pod" ? scope.pod.id : null,
    };
  }

  private static scopeKey(scope: SandboxEnvVarScope): string {
    return scopeEncryptionKey(scope);
  }

  private static maxVarsForScope(scope: SandboxEnvVarScope): number {
    return scope.kind === "pod" ? MAX_VARS_PER_POD : MAX_VARS_PER_WORKSPACE;
  }

  // Write paths guarantee https_secret rows carry a nonce and domains; this
  // narrows the row-level nullable columns for readers of that kind.
  isHttpsSecretWithMaterial(): this is HttpsSecretSandboxEnvVar {
    return (
      this.kind === "https_secret" &&
      this.placeholderNonce !== null &&
      this.allowedDomains !== null
    );
  }

  // Whether this row belongs to the given scope. Fetches are scope-filtered
  // (see `scopeWhere`); this backs the mutation-time assertion below.
  belongsToScope(scope: SandboxEnvVarScope): boolean {
    return scope.kind === "pod"
      ? this.spaceId === scope.pod.id
      : this.spaceId === null;
  }

  // Mutations derive the encryption key from the caller's scope object — a
  // mismatched scope would re-encrypt the row under the wrong key and
  // silently brick it.
  private assertRowBelongsToScope(
    auth: Authenticator,
    scope: SandboxEnvVarScope
  ) {
    SandboxEnvVarResource.assertScope(auth, scope);
    assert(
      this.belongsToScope(scope),
      "Sandbox environment variable does not belong to this scope."
    );
  }

  // Boot-path loads for a pod scope must be tied to the sandbox activation
  // owner: it states caller intent, catching plumbing that would inject one
  // pod's secrets into another pod's sandbox. Pod config applies to every
  // Computer running in the Pod, so both pod-owned sandboxes and
  // conversation-owned sandboxes whose conversation lives in the pod
  // qualify. Not an authorization point — row scoping decides access.
  private static assertBootOwner(
    scope: SandboxEnvVarScope,
    owner: SandboxRuntimeOwner | undefined
  ) {
    if (scope.kind === "pod") {
      assert(
        owner !== undefined && owner.spaceId === scope.pod.sId,
        "Pod env vars can only be loaded for sandboxes running in that pod."
      );
    }
  }

  private auditMetadataBase(): Record<string, string> {
    return {
      name: this.envName,
      kind: this.kind,
      allowed_domains: formatAllowedDomainsForAudit(this.allowedDomains),
      // Pod-scoped rows carry their pod space sId; workspace rows omit the
      // key entirely (metadata values must be strings, never null).
      ...(this.spaceId !== null
        ? {
            space_id: SpaceResource.modelIdToSId({
              id: this.spaceId,
              workspaceId: this.workspaceId,
            }),
          }
        : {}),
    };
  }

  // ── Fetch ──────────────────────────────────────────────────────────────

  private static fromRow(row: SandboxEnvVarModel) {
    return new this(this.model, row.get(), {
      createdByName: row.createdByUser?.name ?? null,
      lastUpdatedByName: row.lastUpdatedByUser?.name ?? null,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    where?: Partial<Pick<SandboxEnvVarModel, "id" | "kind" | "name">>,
    { withUserJoins = true }: { withUserJoins?: boolean } = {}
  ): Promise<SandboxEnvVarResource[]> {
    this.assertScope(auth, scope);

    const isPointLookup = Boolean(where?.id ?? where?.name);
    const rows = await this.model.findAll({
      where: {
        ...where,
        ...this.scopeWhere(auth, scope),
      },
      include: withUserJoins ? USER_JOIN_INCLUDES : [],
      // Skip ordering on point lookups — per-scope (name) is unique.
      order: isPointLookup ? undefined : [["name", "ASC"]],
    });

    return rows.map((row) => this.fromRow(row));
  }

  static async listForScope(
    auth: Authenticator,
    scope: SandboxEnvVarScope
  ): Promise<SandboxEnvVarResource[]> {
    return this.baseFetch(auth, scope);
  }

  // Multi-pod read for the admin comparison view: one query across the given
  // pods' scopes instead of one per pod. Values stay encrypted and are never
  // exposed on this path, so no scope key is involved.
  static async listForPods(
    auth: Authenticator,
    pods: SpaceResource[]
  ): Promise<SandboxEnvVarResource[]> {
    if (pods.length === 0) {
      return [];
    }
    for (const pod of pods) {
      this.assertScope(auth, { kind: "pod", pod });
    }

    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: { [Op.in]: pods.map((pod) => pod.id) },
      },
      include: USER_JOIN_INCLUDES,
      order: [["name", "ASC"]],
    });

    return rows.map((row) => this.fromRow(row));
  }

  static async fetchByName(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    name: string
  ): Promise<SandboxEnvVarResource | null> {
    const rows = await this.baseFetch(auth, scope, { name });
    return rows[0] ?? null;
  }

  // Fetches by sId within the given scope. Cross-scope sIds resolve to null,
  // which routes surface as 404s — the table also holds rows from other
  // scopes, and they must stay unreachable through a mismatched scope.
  static async fetchById(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    sId: string
  ): Promise<SandboxEnvVarResource | null> {
    if (!isResourceSId("sandbox_env_var", sId)) {
      return null;
    }
    const id = getResourceIdFromSId(sId);
    if (id === null) {
      return null;
    }

    const rows = await this.baseFetch(auth, scope, { id });
    return rows[0] ?? null;
  }

  // ── Mutations ──────────────────────────────────────────────────────────

  // Rejects kind transitions: the one-way config -> https_secret promotion
  // goes through `promoteToHttpsSecret`. For an existing https_secret row,
  // callers may pass `allowedDomains` alongside the new value to rotate both
  // in one call; this emits both `sandbox_env_var.updated` and
  // `sandbox_env_var.allowed_domains_updated`. With `createOnly`, an
  // existing row is rejected before any write — the update branch must never
  // run for create-only callers.
  static async upsert(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    {
      name,
      value,
      kind = "config",
      allowedDomains,
      context,
      createOnly = false,
    }: {
      name: string;
      value: string;
      kind?: SandboxEnvVarKind;
      allowedDomains?: string[] | null;
      context?: AuditLogContext;
      createOnly?: boolean;
    }
  ): Promise<
    Result<{ resource: SandboxEnvVarResource; created: boolean }, Error>
  > {
    SandboxEnvVarResource.assertScope(auth, scope);

    const owner = auth.getNonNullableWorkspace();
    // Admin-only path today. If we ever seed env vars from a script or Temporal
    // activity, swap this for an optional `actor` parameter.
    const user = auth.getNonNullableUser();

    const nameValidation = validateEnvVarName(name);
    if (nameValidation.isErr()) {
      return new Err(new Error(nameValidation.error));
    }

    const valueValidation = validateEnvVarValueForKind({ kind, value });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    const encryptedValue = encrypt({
      text: value,
      key: this.scopeKey(scope),
      useCase: "developer_secret",
    });

    const existing = await this.model.findOne({
      where: {
        ...this.scopeWhere(auth, scope),
        name,
      },
    });

    let row: SandboxEnvVarModel;
    let created: boolean;
    let allowedDomainsChanged = false;
    let previousAllowedDomains: string[] | null = null;
    if (existing) {
      if (createOnly) {
        return new Err(
          new Error("Sandbox environment variable already exists.")
        );
      }

      if (existing.kind !== kind) {
        return new Err(
          new Error(
            `Cannot change sandbox environment variable kind from ${existing.kind} to ${kind} through upsert.`
          )
        );
      }

      const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
        kind,
        allowedDomains,
        requiredForSecret: false,
      });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }
      previousAllowedDomains = existing.allowedDomains;
      allowedDomainsChanged =
        allowedDomains !== undefined &&
        allowedDomains !== null &&
        !areAllowedDomainsEqual(
          previousAllowedDomains,
          normalizedAllowedDomains.value
        );

      // `existing` is a Sequelize model instance (we found it via `findOne`
      // above), not a Resource — that's why we call its `update()` directly
      // instead of `this.update()`. The Resource's `this.update()` is used
      // in `updateValue` / `updateAllowedDomains` where we already hold a
      // resource handle.
      row = await existing.update({
        encryptedValue,
        ...(allowedDomains === undefined || allowedDomains === null
          ? {}
          : { allowedDomains: normalizedAllowedDomains.value }),
        lastUpdatedByUserId: user.id,
      });
      created = false;
    } else {
      const count = await this.model.count({
        where: this.scopeWhere(auth, scope),
      });
      // Best-effort cap. A concurrent burst of creates in the same scope can
      // land 1-2 rows over the cap under READ COMMITTED. Acceptable: cap is
      // a UI guard, not a security boundary.
      if (count >= this.maxVarsForScope(scope)) {
        return new Err(
          new Error(
            `Sandbox environment variable limit reached (${this.maxVarsForScope(scope)}).`
          )
        );
      }

      const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
        kind,
        allowedDomains,
        requiredForSecret: true,
      });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }

      try {
        row = await this.model.create({
          workspaceId: owner.id,
          spaceId: scope.kind === "pod" ? scope.pod.id : null,
          name,
          kind,
          // 16 bytes = 32 hex chars in the placeholder; matches the
          // `__DSEC_<32hex>__` format from the design doc. Stable for the
          // life of the row (rotations and allowedDomains edits don't touch
          // it).
          placeholderNonce: kind === "https_secret" ? randomBytes(16) : null,
          allowedDomains: normalizedAllowedDomains.value ?? null,
          encryptedValue,
          createdByUserId: user.id,
          lastUpdatedByUserId: user.id,
        });
      } catch (error) {
        // A concurrent create can slip past the findOne above and lose to
        // the per-scope unique index — surface it like the sequential
        // duplicate instead of leaking the Sequelize exception.
        if (error instanceof UniqueConstraintError) {
          return new Err(
            new Error("Sandbox environment variable already exists.")
          );
        }
        throw error;
      }
      created = true;
    }

    // Reload by primary key to populate createdByUser / lastUpdatedByUser
    // associations — the row returned by update() / create() has no joins
    // loaded, which would surface as "Unknown" in the UI until SWR re-lists.
    await row.reload({ include: USER_JOIN_INCLUDES });
    const resource = this.fromRow(row);

    void emitAuditLogEvent({
      auth,
      action: created ? "sandbox_env_var.created" : "sandbox_env_var.updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: resource.sId,
          name: resource.envName,
        }),
      ],
      context,
      metadata: created
        ? resource.auditMetadataBase()
        : {
            ...resource.auditMetadataBase(),
            previously_existed: "true",
          },
    });

    if (!created && allowedDomainsChanged) {
      void emitAuditLogEvent({
        auth,
        action: "sandbox_env_var.allowed_domains_updated",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("sandbox_env_var", {
            sId: resource.sId,
            name: resource.envName,
          }),
        ],
        context,
        metadata: {
          ...resource.auditMetadataBase(),
          previous_allowed_domains: formatAllowedDomainsForAudit(
            previousAllowedDomains
          ),
        },
      });
    }

    return new Ok({ resource, created });
  }

  // Create-only entry point for callers that must not replace an existing
  // value: upsert's createOnly rejects an existing row before any write.
  // Relies on the per-scope unique indexes to catch concurrent creates.
  static async makeNew(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    {
      name,
      value,
      kind = "config",
      allowedDomains,
      context,
    }: {
      name: string;
      value: string;
      kind?: SandboxEnvVarKind;
      allowedDomains?: string[] | null;
      context?: AuditLogContext;
    }
  ): Promise<Result<SandboxEnvVarResource, Error>> {
    const result = await this.upsert(auth, scope, {
      name,
      value,
      kind,
      allowedDomains,
      context,
      createOnly: true,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok(result.value.resource);
  }

  async promoteToHttpsSecret(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    {
      allowedDomains,
      context,
    }: {
      allowedDomains: string[];
      context?: AuditLogContext;
    }
  ): Promise<Result<SandboxEnvVarResource, Error>> {
    this.assertRowBelongsToScope(auth, scope);

    if (this.kind !== "config") {
      return new Err(
        new Error(
          "Only config sandbox environment variables can be promoted to HTTPS secrets."
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const previousEnvName = this.envName;

    const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
      kind: "https_secret",
      allowedDomains,
      requiredForSecret: true,
    });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }
    const normalizedAllowedDomainsValue = normalizedAllowedDomains.value;
    if (!normalizedAllowedDomainsValue) {
      return new Err(
        new Error("HTTPS secrets require at least one allowed domain.")
      );
    }

    let currentValue: string;
    try {
      currentValue = decrypt({
        encrypted: this.encryptedValue,
        key: SandboxEnvVarResource.scopeKey(scope),
        useCase: "developer_secret",
      });
    } catch (error) {
      return new Err(
        new Error(
          `Failed to decrypt sandbox environment variable ${previousEnvName}: ${
            normalizeError(error).message
          }`
        )
      );
    }

    const valueValidation = validateEnvVarValueForKind({
      kind: "https_secret",
      value: currentValue,
    });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    await this.update({
      kind: "https_secret",
      placeholderNonce: randomBytes(16),
      allowedDomains: normalizedAllowedDomainsValue,
      lastUpdatedByUserId: user.id,
    });

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.promoted_to_https_secret",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: this.sId,
          name: this.envName,
        }),
      ],
      context,
      metadata: {
        ...this.auditMetadataBase(),
        previous_name: previousEnvName,
      },
    });

    return new Ok(this);
  }

  async updateValue(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    {
      value,
      context,
    }: {
      value: string;
      context?: AuditLogContext;
    }
  ): Promise<Result<SandboxEnvVarResource, Error>> {
    this.assertRowBelongsToScope(auth, scope);

    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const valueValidation = validateEnvVarValueForKind({
      kind: this.kind,
      value,
    });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    const encryptedValue = encrypt({
      text: value,
      key: SandboxEnvVarResource.scopeKey(scope),
      useCase: "developer_secret",
    });

    await this.update({
      encryptedValue,
      lastUpdatedByUserId: user.id,
    });

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: this.sId,
          name: this.envName,
        }),
      ],
      context,
      metadata: {
        ...this.auditMetadataBase(),
        previously_existed: "true",
      },
    });

    return new Ok(this);
  }

  async updateAllowedDomains(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    {
      allowedDomains,
      context,
    }: {
      allowedDomains: string[];
      context?: AuditLogContext;
    }
  ): Promise<Result<SandboxEnvVarResource, Error>> {
    this.assertRowBelongsToScope(auth, scope);

    if (this.kind !== "https_secret") {
      return new Err(
        new Error("Allowed domains can only be updated for HTTPS secrets.")
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const previousAllowedDomains = this.allowedDomains;

    const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
      kind: this.kind,
      allowedDomains,
      requiredForSecret: true,
    });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }
    const normalizedAllowedDomainsValue = normalizedAllowedDomains.value;
    if (!normalizedAllowedDomainsValue) {
      return new Err(
        new Error("HTTPS secrets require at least one allowed domain.")
      );
    }

    if (
      areAllowedDomainsEqual(
        previousAllowedDomains,
        normalizedAllowedDomainsValue
      )
    ) {
      return new Ok(this);
    }

    await this.update({
      allowedDomains: normalizedAllowedDomainsValue,
      lastUpdatedByUserId: user.id,
    });

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.allowed_domains_updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: this.sId,
          name: this.envName,
        }),
      ],
      context,
      metadata: {
        ...this.auditMetadataBase(),
        previous_allowed_domains: formatAllowedDomainsForAudit(
          previousAllowedDomains
        ),
      },
    });

    return new Ok(this);
  }

  // No scope parameter on purpose: deletion never touches the encryption
  // key, and rows only reach callers through scope-filtered fetches.
  async delete(
    auth: Authenticator,
    {
      context,
      transaction,
    }: { context?: AuditLogContext; transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const destroyedCount = await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: owner.id,
      },
      transaction,
    });

    // A concurrent delete between the endpoint's fetchById and this destroy
    // can race us to 0 rows. Don't emit a duplicate audit event in that case.
    if (destroyedCount === 0) {
      return new Ok(undefined);
    }

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.deleted",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: this.sId,
          name: this.envName,
        }),
      ],
      context,
      metadata: this.auditMetadataBase(),
    });

    return new Ok(undefined);
  }

  // Pod scrub: the FK to spaces is `onDelete: "RESTRICT"`, so the pod-scoped
  // rows must go before the pod itself can be hard-deleted.
  static async deleteAllForPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<undefined> {
    assert(pod.isProject(), "Sandbox env vars can only be scoped to pods.");

    await this.model.destroy({
      where: {
        spaceId: pod.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  // Workspace scrub: spaces (and their pod-scoped rows) are already gone by
  // the time this runs; destroying by workspaceId sweeps the remaining
  // workspace-scoped rows plus any stragglers.
  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  // ── Boot-path loads ────────────────────────────────────────────────────

  // Decrypts config vars for provider env injection. HTTPS secrets are
  // handled separately by loadHttpsSecretPlaceholderEnv — injecting their
  // real value here would defeat the MITM swap. Hot path on sandbox create —
  // skip the user joins.
  static async loadEnv(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    owner?: SandboxRuntimeOwner
  ): Promise<Result<Record<string, string>, Error>> {
    this.assertBootOwner(scope, owner);

    const resources = await this.baseFetch(
      auth,
      scope,
      { kind: "config" },
      { withUserJoins: false }
    );

    const env: Record<string, string> = {};
    for (const resource of resources) {
      try {
        env[resource.envName] = decrypt({
          encrypted: resource.encryptedValue,
          key: this.scopeKey(scope),
          useCase: "developer_secret",
        });
      } catch (error) {
        return new Err(
          new Error(
            `Failed to decrypt sandbox environment variable ${resource.envName}: ${
              normalizeError(error).message
            }`
          )
        );
      }
    }

    return new Ok(env);
  }

  static async listHttpsSecretsForEgress(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    owner?: SandboxRuntimeOwner
  ): Promise<Result<HttpsSecretSandboxEnvVar[], Error>> {
    this.assertBootOwner(scope, owner);

    const resources = await this.baseFetch(
      auth,
      scope,
      { kind: "https_secret" },
      { withUserJoins: false }
    );

    // Fail closed on rows violating the write-time invariant, so callers
    // get the narrowed type without re-checking per field.
    const secrets: HttpsSecretSandboxEnvVar[] = [];
    for (const resource of resources) {
      if (!resource.isHttpsSecretWithMaterial()) {
        const missing =
          resource.placeholderNonce === null
            ? "its placeholder nonce"
            : "allowed domains";
        return new Err(
          new Error(
            `HTTPS secret sandbox environment variable ${resource.envName} is missing ${missing}.`
          )
        );
      }
      secrets.push(resource);
    }

    return new Ok(secrets);
  }

  static async loadHttpsSecretPlaceholderEnv(
    auth: Authenticator,
    scope: SandboxEnvVarScope,
    owner?: SandboxRuntimeOwner
  ): Promise<Result<Record<string, string>, Error>> {
    const secretsResult = await this.listHttpsSecretsForEgress(
      auth,
      scope,
      owner
    );
    if (secretsResult.isErr()) {
      return secretsResult;
    }

    const env: Record<string, string> = {};
    for (const resource of secretsResult.value) {
      env[resource.envName] = renderEgressSecretPlaceholder(
        resource.placeholderNonce
      );
    }

    return new Ok(env);
  }

  // ── Serialization ──────────────────────────────────────────────────────

  toJSON(): SandboxEnvVarType {
    return {
      sId: this.sId,
      name: this.envName,
      kind: this.kind,
      placeholderNonce: this.placeholderNonce
        ? this.placeholderNonce.toString("hex")
        : null,
      allowedDomains: this.allowedDomains ? [...this.allowedDomains] : null,
      spaceId:
        this.spaceId !== null
          ? SpaceResource.modelIdToSId({
              id: this.spaceId,
              workspaceId: this.workspaceId,
            })
          : null,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      createdByName: this.createdByName,
      lastUpdatedByName: this.lastUpdatedByName,
    };
  }

  toLogJSON() {
    return {
      sId: this.sId,
      workspaceId: this.workspaceId,
      spaceId: this.spaceId,
      name: this.envName,
    };
  }
}
