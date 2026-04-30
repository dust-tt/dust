import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { MAX_VARS_PER_WORKSPACE } from "@app/lib/api/sandbox/env_vars";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

  static async upsert(
    auth: Authenticator,
    {
      name,
      value,
      context,
    }: {
      name: string;
      value: string;
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
      row = await existing.update({
        encryptedValue,
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

      row = await this.model.create({
        workspaceId: owner.id,
        name,
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
          name,
        }),
      ],
      context,
      metadata: created ? { name } : { name, previously_existed: "true" },
    });

    return new Ok({ resource, created });
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
          name: this.name,
        }),
      ],
      context,
      metadata: { name: this.name },
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
    const resources = await this.baseFetch(auth, undefined, {
      withUserJoins: false,
    });

    const env: Record<string, string> = {};
    for (const resource of resources) {
      try {
        env[resource.name] = decrypt({
          encrypted: resource.encryptedValue,
          key: owner.sId,
          useCase: "developer_secret",
        });
      } catch (error) {
        return new Err(
          new Error(
            `Failed to decrypt sandbox environment variable ${resource.name}: ${
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
      name: this.name,
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
      name: this.name,
    };
  }
}
