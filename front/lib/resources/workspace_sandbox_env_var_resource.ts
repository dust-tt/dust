import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import {
  MAX_VARS_PER_WORKSPACE,
  renderWorkspaceSandboxEnvVarName,
  validateEnvVarName,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import type {
  WorkspaceSandboxEnvVarKind,
  WorkspaceSandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { randomBytes } from "crypto";
import type { Attributes, Includeable, Transaction } from "sequelize";

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

type NormalizedAllowedDomains = string[] | null | undefined;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceSandboxEnvVarResource
  extends ReadonlyAttributesType<WorkspaceSandboxEnvVarModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceSandboxEnvVarResource extends BaseResource<WorkspaceSandboxEnvVarModel> {
  static model: ModelStaticWorkspaceAware<WorkspaceSandboxEnvVarModel> =
    WorkspaceSandboxEnvVarModel;

  private readonly createdByName: string | null;
  private readonly lastUpdatedByName: string | null;

  constructor(
    _model: ModelStaticWorkspaceAware<WorkspaceSandboxEnvVarModel>,
    blob: Attributes<WorkspaceSandboxEnvVarModel>,
    metadata?: {
      createdByName: string | null;
      lastUpdatedByName: string | null;
    }
  ) {
    super(WorkspaceSandboxEnvVarModel, blob);
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
    return renderWorkspaceSandboxEnvVarName({
      kind: this.kind,
      name: this.name,
    });
  }

  private static fromRow(row: WorkspaceSandboxEnvVarModel) {
    return new this(this.model, row.get(), {
      createdByName: row.createdByUser?.name ?? null,
      lastUpdatedByName: row.lastUpdatedByUser?.name ?? null,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    where?: Partial<Pick<WorkspaceSandboxEnvVarModel, "id" | "name">>,
    { withUserJoins = true }: { withUserJoins?: boolean } = {}
  ): Promise<WorkspaceSandboxEnvVarResource[]> {
    const isPointLookup = Boolean(where?.id ?? where?.name);
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: withUserJoins ? USER_JOIN_INCLUDES : [],
      // Skip ordering on point lookups — primary key is unique.
      order: isPointLookup ? undefined : [["name", "ASC"]],
    });

    return rows.map((row) => this.fromRow(row));
  }

  static async listForWorkspace(
    auth: Authenticator
  ): Promise<WorkspaceSandboxEnvVarResource[]> {
    return this.baseFetch(auth);
  }

  static async fetchByName(
    auth: Authenticator,
    name: string
  ): Promise<WorkspaceSandboxEnvVarResource | null> {
    const rows = await this.baseFetch(auth, { name });
    return rows[0] ?? null;
  }

  static async fetchById(
    auth: Authenticator,
    id: ModelId
  ): Promise<WorkspaceSandboxEnvVarResource | null> {
    const rows = await this.baseFetch(auth, { id });
    return rows[0] ?? null;
  }

  // `kind` and `allowedDomains` are reachable in slice 2 once the API/admin
  // UI accept them. Slice 1 callers stick to `kind = 'config'` defaults and
  // never pass `allowedDomains`.
  static async upsert(
    auth: Authenticator,
    {
      name,
      value,
      kind = "config",
      allowedDomains,
      context,
    }: {
      name: string;
      value: string;
      kind?: WorkspaceSandboxEnvVarKind;
      allowedDomains?: string[] | null;
      context?: AuditLogContext;
    }
  ): Promise<
    Result<
      { resource: WorkspaceSandboxEnvVarResource; created: boolean },
      Error
    >
  > {
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
      key: owner.sId,
      useCase: "developer_secret",
    });

    const existing = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        name,
      },
    });

    let row: WorkspaceSandboxEnvVarModel;
    let created: boolean;
    if (existing) {
      if (existing.kind !== kind) {
        return new Err(
          new Error(
            `Cannot change sandbox environment variable kind from ${existing.kind} to ${kind} through upsert.`
          )
        );
      }

      const normalizedAllowedDomains =
        this.normalizeAllowedDomainsForKind({
          kind,
          allowedDomains,
          requiredForSecret: false,
        });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }

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
        where: {
          workspaceId: owner.id,
        },
      });
      // Best-effort cap. A concurrent burst of creates from the same workspace
      // can land 1-2 rows over MAX_VARS_PER_WORKSPACE under READ COMMITTED.
      // Acceptable: cap is a UI guard, not a security boundary.
      if (count >= MAX_VARS_PER_WORKSPACE) {
        return new Err(
          new Error(
            `Workspace sandbox environment variable limit reached (${MAX_VARS_PER_WORKSPACE}).`
          )
        );
      }

      const normalizedAllowedDomains =
        this.normalizeAllowedDomainsForKind({
          kind,
          allowedDomains,
          requiredForSecret: true,
        });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }

      row = await this.model.create({
        workspaceId: owner.id,
        name,
        kind,
        // 16 bytes = 32 hex chars in the placeholder; matches the
        // `__DSEC_<32hex>__` format from the design doc. Stable for the life
        // of the row (rotations and allowedDomains edits don't touch it).
        placeholderNonce: kind === "https_secret" ? randomBytes(16) : null,
        allowedDomains: normalizedAllowedDomains.value,
        encryptedValue,
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      });
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
        ? { name: resource.envName }
        : { name: resource.envName, previously_existed: "true" },
    });

    return new Ok({ resource, created });
  }

  // Slice-2-callable. Slice 1's API still routes through `upsert()`; this
  // helper exists so future callers (admin promotion flow, scripts) get a
  // create-only entry point without piggybacking on upsert's update branch.
  // Implementation defers to upsert() and rejects when the row already
  // existed — relies on the unique index to catch concurrent creates.
  static async create(
    auth: Authenticator,
    {
      name,
      value,
      kind = "config",
      allowedDomains,
      context,
    }: {
      name: string;
      value: string;
      kind?: WorkspaceSandboxEnvVarKind;
      allowedDomains?: string[] | null;
      context?: AuditLogContext;
    }
  ): Promise<Result<WorkspaceSandboxEnvVarResource, Error>> {
    const result = await this.upsert(auth, {
      name,
      value,
      kind,
      allowedDomains,
      context,
    });
    if (result.isErr()) {
      return result;
    }

    if (!result.value.created) {
      return new Err(
        new Error("Sandbox environment variable already exists.")
      );
    }

    return new Ok(result.value.resource);
  }

  async updateValue(
    auth: Authenticator,
    {
      value,
      context,
    }: {
      value: string;
      context?: AuditLogContext;
    }
  ): Promise<Result<WorkspaceSandboxEnvVarResource, Error>> {
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
      key: owner.sId,
      useCase: "developer_secret",
    });

    await this.update({
      encryptedValue,
      lastUpdatedByUserId: user.id,
    });

    const updated = await WorkspaceSandboxEnvVarResource.fetchById(
      auth,
      this.id
    );
    if (!updated) {
      return new Err(new Error("Sandbox environment variable not found."));
    }

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: updated.sId,
          name: updated.envName,
        }),
      ],
      context,
      metadata: { name: updated.envName, previously_existed: "true" },
    });

    return new Ok(updated);
  }

  async updateAllowedDomains(
    auth: Authenticator,
    {
      allowedDomains,
      context,
    }: {
      allowedDomains: string[];
      context?: AuditLogContext;
    }
  ): Promise<Result<WorkspaceSandboxEnvVarResource, Error>> {
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const normalizedAllowedDomains =
      WorkspaceSandboxEnvVarResource.normalizeAllowedDomainsForKind({
        kind: this.kind,
        allowedDomains,
        requiredForSecret: true,
      });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }

    await this.update({
      allowedDomains: normalizedAllowedDomains.value,
      lastUpdatedByUserId: user.id,
    });

    const updated = await WorkspaceSandboxEnvVarResource.fetchById(
      auth,
      this.id
    );
    if (!updated) {
      return new Err(new Error("Sandbox environment variable not found."));
    }

    void emitAuditLogEvent({
      auth,
      action: "sandbox_env_var.updated",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("sandbox_env_var", {
          sId: updated.sId,
          name: updated.envName,
        }),
      ],
      context,
      metadata: { name: updated.envName, previously_existed: "true" },
    });

    return new Ok(updated);
  }

  private static normalizeAllowedDomainsForKind({
    kind,
    allowedDomains,
    requiredForSecret,
  }: {
    kind: WorkspaceSandboxEnvVarKind;
    allowedDomains: string[] | null | undefined;
    requiredForSecret: boolean;
  }): Result<NormalizedAllowedDomains, Error> {
    switch (kind) {
      case "config": {
        if (allowedDomains && allowedDomains.length > 0) {
          return new Err(
            new Error("allowedDomains can only be set for HTTPS secrets.")
          );
        }

        return new Ok(null);
      }

      case "https_secret": {
        if (!allowedDomains) {
          if (requiredForSecret) {
            return new Err(
              new Error("HTTPS secrets require at least one allowed domain.")
            );
          }

          return new Ok(undefined);
        }

        if (allowedDomains.length === 0) {
          return new Err(
            new Error("HTTPS secrets require at least one allowed domain.")
          );
        }

        const normalized = normalizeEgressPolicyDomains(allowedDomains);
        if (normalized.isErr()) {
          return normalized;
        }

        if (normalized.value.length === 0) {
          return new Err(
            new Error("HTTPS secrets require at least one allowed domain.")
          );
        }

        return normalized;
      }

      default:
        assertNever(kind);
    }
  }

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

    // A concurrent delete between the endpoint's fetchById and this destroy can
    // race us to 0 rows. Don't emit a duplicate audit event in that case.
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
      metadata: { name: this.envName },
    });

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async loadEnv(
    auth: Authenticator
  ): Promise<Result<Record<string, string>, Error>> {
    const owner = auth.getNonNullableWorkspace();
    // Hot path on every sandbox mount — skip the user joins, we only need
    // name + encryptedValue here.
    //
    // TODO(2026-05-05 SLICE_2): skip `kind = 'https_secret'` rows here.
    // Their real value must NOT land in the agent env as `DSEC_<name>`
    // plaintext — substitution is supposed to happen on the wire from
    // the secrets file. Slice 1 leaves them in for symmetry; the
    // production-user gate (no admin promotes rows in prod until the
    // last slice) keeps this safe in the meantime.
    const resources = await this.baseFetch(auth, undefined, {
      withUserJoins: false,
    });

    const env: Record<string, string> = {};
    for (const resource of resources) {
      const envName = renderWorkspaceSandboxEnvVarName({
        kind: resource.kind,
        name: resource.name,
      });

      try {
        env[envName] = decrypt({
          encrypted: resource.encryptedValue,
          key: owner.sId,
          useCase: "developer_secret",
        });
      } catch (error) {
        return new Err(
          new Error(
            `Failed to decrypt sandbox environment variable ${envName}: ${
              normalizeError(error).message
            }`
          )
        );
      }
    }

    return new Ok(env);
  }

  toJSON(): WorkspaceSandboxEnvVarType {
    return {
      sId: this.sId,
      name: this.envName,
      kind: this.kind,
      placeholderNonce: this.placeholderNonce
        ? this.placeholderNonce.toString("hex")
        : null,
      allowedDomains: this.allowedDomains ? [...this.allowedDomains] : null,
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
      name: this.envName,
    };
  }
}
