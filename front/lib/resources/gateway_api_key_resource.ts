import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GatewayApiKeyModel } from "@app/lib/resources/storage/models/gateway_api_key";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { PlanGatewayType } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

const OAUTH_DELETE_CONCURRENCY = 8;

export type NewGatewayApiKey = {
  gateway: PlanGatewayType;
  credentialId: string;
  gatewayKeyId: string;
};

// Returned by `makeNew` when another call stored the caller's key first.
export class GatewayApiKeyConflictError extends Error {}

export interface GatewayApiKeyResource extends ReadonlyAttributesType<GatewayApiKeyModel> {}
/**
 * @cc [owner:pmilliotte,label:security] gateway-key-owned-by-caller
 * A gateway key MUST be read and stored for the caller only: the key of `auth.user()`, or the
 * workspace key (`userId` NULL) when the authenticator carries no user. It MUST NOT return another
 * user's key.
 */
export class GatewayApiKeyResource extends BaseResource<GatewayApiKeyModel> {
  static model: ModelStaticWorkspaceAware<GatewayApiKeyModel> =
    GatewayApiKeyModel;

  constructor(
    model: ModelStatic<GatewayApiKeyModel>,
    blob: Attributes<GatewayApiKeyModel>
  ) {
    super(GatewayApiKeyModel, blob);
  }

  static async fetchForCaller(
    auth: Authenticator,
    gateway: PlanGatewayType
  ): Promise<GatewayApiKeyResource | null> {
    const model = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        gateway,
        userId: auth.user()?.id ?? null,
      },
    });
    return model ? new GatewayApiKeyResource(GatewayApiKeyModel, model.get()) : null;
  }

  static async makeNew(
    auth: Authenticator,
    { gateway, credentialId, gatewayKeyId }: NewGatewayApiKey
  ): Promise<Result<GatewayApiKeyResource, Error>> {
    // ON CONFLICT DO NOTHING rather than catching the unique violation, which would abort an
    // enclosing transaction. A skipped insert comes back without an id.
    const [created] = await this.model.bulkCreate(
      [
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          gateway,
          userId: auth.user()?.id ?? null,
          credentialId,
          gatewayKeyId,
        },
      ],
      { ignoreDuplicates: true, returning: true }
    );

    return created && Number.isInteger(created.id)
      ? new Ok(new GatewayApiKeyResource(GatewayApiKeyModel, created.get()))
      : new Err(new GatewayApiKeyConflictError("Gateway key already stored."));
  }

  // Drops the stored secrets; the keys stay valid on the gateway side until revoked there.
  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const models = await this.model.findAll({
      where: { workspaceId: workspace.id },
    });

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    await concurrentExecutor(
      models,
      (m) => oauthApi.deleteCredentials({ credentialsId: m.credentialId }),
      { concurrency: OAUTH_DELETE_CONCURRENCY }
    );

    await this.model.destroy({ where: { workspaceId: workspace.id } });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    try {
      const affectedCount = await this.model.destroy({
        where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
        transaction,
      });
      return new Ok(affectedCount);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
