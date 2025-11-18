import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { InternalMCPServerCredentialModel } from "@app/lib/models/assistant/actions/internal_mcp_server_credentials";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types";
import { Err, Ok, redactString } from "@app/types";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface InternalMCPServerCredentialResource
  extends ReadonlyAttributesType<InternalMCPServerCredentialModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InternalMCPServerCredentialResource extends BaseResource<InternalMCPServerCredentialModel> {
  static model: ModelStatic<InternalMCPServerCredentialModel> =
    InternalMCPServerCredentialModel;

  constructor(
    model: ModelStatic<InternalMCPServerCredentialModel>,
    blob: Attributes<InternalMCPServerCredentialModel>
  ) {
    super(model, blob);
  }

  static async upsert(
    auth: Authenticator,
    {
      internalMCPServerId,
      sharedSecret,
      customHeaders,
    }: {
      internalMCPServerId: string;
      sharedSecret?: string;
      customHeaders?: Record<string, string> | null;
    },
    transaction?: Transaction
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to update this MCP server."
        )
      );
    }

    const existing = await InternalMCPServerCredentialModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId,
      },
      transaction,
    });

    let record: InternalMCPServerCredentialModel;

    if (existing) {
      const updatePayload: Partial<
        CreationAttributes<InternalMCPServerCredentialModel>
      > = {};
      if (sharedSecret !== undefined) {
        updatePayload.sharedSecret = sharedSecret || null;
      }
      if (customHeaders !== undefined) {
        updatePayload.customHeaders = customHeaders ?? null;
      }
      if (Object.keys(updatePayload).length > 0) {
        await existing.update(updatePayload, { transaction });
      }
      record = existing;
    } else {
      record = await InternalMCPServerCredentialModel.create(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          internalMCPServerId,
          sharedSecret: sharedSecret ?? null,
          customHeaders: customHeaders ?? null,
        },
        { transaction }
      );
    }

    return new Ok(
      new InternalMCPServerCredentialResource(
        InternalMCPServerCredentialModel,
        record.get()
      )
    );
  }

  static async fetchByInternalMCPServerId(
    auth: Authenticator,
    internalMCPServerId: string
  ): Promise<InternalMCPServerCredentialResource | null> {
    const record = await InternalMCPServerCredentialModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId,
      },
    });

    if (!record) {
      return null;
    }

    return new InternalMCPServerCredentialResource(
      InternalMCPServerCredentialModel,
      record.get()
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      return new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to delete these credentials."
        )
      );
    }

    const deleted = await InternalMCPServerCredentialModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deleted);
  }

  toJSON(): {
    sharedSecret: string | null;
    customHeaders: Record<string, string> | null;
  } {
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));

    const secret =
      this.sharedSecret &&
      differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES
        ? redactString(this.sharedSecret, 4)
        : this.sharedSecret;

    return {
      sharedSecret: secret,
      customHeaders: this.customHeaders ?? null,
    };
  }
}
