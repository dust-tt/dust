import {
  MAX_VARS_PER_WORKSPACE,
  validateEnvVarName,
  validateEnvVarValue,
} from "@app/lib/api/sandbox/env_vars";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction } from "sequelize";

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

  private static fromRow(row: WorkspaceSandboxEnvVarModel) {
    return new this(this.model, row.get(), {
      createdByName: row.createdByUser?.name ?? null,
      lastUpdatedByName: row.lastUpdatedByUser?.name ?? null,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    where?: Partial<Pick<WorkspaceSandboxEnvVarModel, "id" | "name">>
  ): Promise<WorkspaceSandboxEnvVarResource[]> {
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
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
      ],
      order: [["name", "ASC"]],
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
    }: {
      name: string;
      value: string;
    }
  ): Promise<Result<{ created: boolean }, Error>> {
    const nameValidation = validateEnvVarName(name);
    if (nameValidation.isErr()) {
      return new Err(new Error(nameValidation.error));
    }

    const valueValidation = validateEnvVarValue(value);
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    const owner = auth.getNonNullableWorkspace();
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

    if (existing) {
      await existing.update({
        encryptedValue,
        lastUpdatedByUserId: user.id,
      });
      return new Ok({ created: false });
    }

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

    await this.model.create({
      workspaceId: owner.id,
      name,
      encryptedValue,
      createdByUserId: user.id,
      lastUpdatedByUserId: user.id,
    });

    return new Ok({ created: true });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
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
    const resources = await this.baseFetch(auth);

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
      name: this.name,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      createdByName: this.createdByName,
      lastUpdatedByName: this.lastUpdatedByName,
    };
  }

  toLogJSON() {
    return {
      workspaceId: this.workspaceId,
      name: this.name,
    };
  }
}
