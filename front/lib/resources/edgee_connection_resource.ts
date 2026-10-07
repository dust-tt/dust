import config from "@app/lib/api/config";
import { checkEdgeeOrganizationAccess } from "@app/lib/api/edgee/console_client";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import logger from "@app/logger/logger";
import type { EdgeeAdminCredentials } from "@app/types/gateways/edgee";
import { EdgeeAdminCredentialsSchema } from "@app/types/gateways/edgee";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic } from "sequelize";

const EDGEE_PROVIDER_ID = "edgee";

export type EdgeeConnectionParams = {
  adminToken: string;
  organizationId: string;
};

export type EdgeeConnectionType = {
  organizationId: string;
  editedByUserId: ModelId | null;
  updatedAt: number;
};

export interface EdgeeConnectionResource extends ReadonlyAttributesType<ProviderCredentialModel> {}
/**
 * @cc [owner:pmilliotte,label:security] edgee-connection-on-edgee-plans-only
 * An Edgee connection MUST only be created, read or deleted for a workspace whose plan `gateway`
 * is `edgee`, and only a workspace admin may create or delete it.
 */
/**
 * @cc [owner:pmilliotte,label:security] edgee-admin-token-never-serialized
 * The admin token MUST NOT leave this resource other than to call Edgee's Console API: `toJSON`
 * and every log line MUST omit it.
 */
export class EdgeeConnectionResource extends BaseResource<ProviderCredentialModel> {
  static model: ModelStaticWorkspaceAware<ProviderCredentialModel> =
    ProviderCredentialModel;

  private readonly credentials: EdgeeAdminCredentials;

  constructor(
    model: ModelStatic<ProviderCredentialModel>,
    blob: Attributes<ProviderCredentialModel>,
    credentials: EdgeeAdminCredentials
  ) {
    super(ProviderCredentialModel, blob);
    this.credentials = credentials;
  }

  get organizationId(): string {
    return this.credentials.organization_id;
  }

  get adminToken(): string {
    return this.credentials.api_key;
  }

  private static isEdgeeWorkspace(auth: Authenticator): boolean {
    return auth.getNonNullablePlan().gateway === "edgee";
  }

  static async fetch(
    auth: Authenticator
  ): Promise<EdgeeConnectionResource | null> {
    if (!this.isEdgeeWorkspace(auth)) {
      return null;
    }

    const model = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        providerId: EDGEE_PROVIDER_ID,
      },
    });
    if (!model) {
      return null;
    }

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const credentialRes = await oauthApi.getCredentials({
      credentialsId: model.credentialId,
    });
    if (credentialRes.isErr()) {
      throw new Error(
        `Failed to fetch the Edgee connection credentials: ${credentialRes.error.message}`
      );
    }

    return new EdgeeConnectionResource(
      ProviderCredentialModel,
      model.get(),
      EdgeeAdminCredentialsSchema.parse(credentialRes.value.credential.content)
    );
  }

  static async upsert(
    auth: Authenticator,
    { adminToken, organizationId }: EdgeeConnectionParams
  ): Promise<Result<EdgeeConnectionResource, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error("Only admins can configure Edgee."));
    }
    if (!this.isEdgeeWorkspace(auth)) {
      return new Err(
        new Error("The workspace plan is not routed through Edgee.")
      );
    }

    const accessRes = await checkEdgeeOrganizationAccess({
      adminToken,
      organizationId,
    });
    if (accessRes.isErr()) {
      return accessRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const credentials: EdgeeAdminCredentials = {
      api_key: adminToken,
      organization_id: organizationId,
    };

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const oauthRes = await oauthApi.postCredentials({
      provider: EDGEE_PROVIDER_ID,
      workspaceId: workspace.sId,
      userId: user.sId,
      credentials,
    });
    if (oauthRes.isErr()) {
      return new Err(
        new Error(
          `Failed to store the Edgee connection: ${oauthRes.error.message}`
        )
      );
    }
    const credentialId = oauthRes.value.credential.credential_id;

    const existing = await this.model.findOne({
      where: { workspaceId: workspace.id, providerId: EDGEE_PROVIDER_ID },
    });
    const previousCredentialId = existing?.credentialId ?? null;
    const model = existing
      ? await existing.update({ credentialId, editedByUserId: user.id })
      : await this.model.create({
          workspaceId: workspace.id,
          providerId: EDGEE_PROVIDER_ID,
          credentialId,
          isHealthy: true,
          placeholder: "",
          editedByUserId: user.id,
        });

    if (previousCredentialId) {
      await oauthApi.deleteCredentials({ credentialsId: previousCredentialId });
    }

    return new Ok(
      new EdgeeConnectionResource(
        ProviderCredentialModel,
        model.get(),
        credentials
      )
    );
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number | undefined, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error("Only admins can remove the Edgee connection."));
    }

    try {
      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      if (affectedCount !== 0) {
        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        await oauthApi.deleteCredentials({ credentialsId: this.credentialId });
      }
      return new Ok(affectedCount);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toJSON(): EdgeeConnectionType {
    return {
      organizationId: this.organizationId,
      editedByUserId: this.editedByUserId,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
