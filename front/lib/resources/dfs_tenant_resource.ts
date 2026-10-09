import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DfsTenantModel } from "@app/lib/models/dfs_tenant";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import logger from "@app/logger/logger";
import type { DfsObjectId } from "@app/types/dfs";
import { DfsTenantCredentialsSchema } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";

function oauthAPI(): OAuthAPI {
  return new OAuthAPI(config.getOAuthAPIConfig(), logger);
}

export interface DfsTenantResource extends ReadonlyAttributesType<DfsTenantModel> {}

/**
 * The dfs tenant of a workspace: the oauth credential holding its tenant key and its stored root
 * directory (`rootId`, not the virtual `root`). A workspace has at most one.
 */
/**
 * @cc [owner:fabiencelier,label:security] tenant-key-in-oauth
 * The tenant key MUST only be stored in the oauth service (credential provider `dfs`), never in
 * the front database, and MUST only leave this resource through `getTenantKey`, for the
 * authenticated workspace only. It MUST NOT be logged or serialized.
 */
export class DfsTenantResource extends BaseResource<DfsTenantModel> {
  static model: ModelStaticWorkspaceAware<DfsTenantModel> = DfsTenantModel;

  constructor(
    _model: ModelStaticWorkspaceAware<DfsTenantModel>,
    blob: Attributes<DfsTenantModel>
  ) {
    super(DfsTenantModel, blob);
  }

  /**
   * Stores the tenant of the authenticated workspace: its key in oauth, its root ID here. Throws if
   * the workspace already has one.
   */
  static async makeNew(
    auth: Authenticator,
    { tenantKey, rootId }: { tenantKey: string; rootId: DfsObjectId }
  ): Promise<Result<DfsTenantResource, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    const posted = await oauthAPI().postCredentials({
      provider: "dfs",
      workspaceId: workspace.sId,
      userId: auth.user()?.sId ?? "", // mostly cosmetics
      credentials: { tenant_key: tenantKey },
    });
    if (posted.isErr()) {
      return new Err(
        new Error(`Failed to store the dfs tenant key: ${posted.error.message}`)
      );
    }
    const credentialId = posted.value.credential.credential_id;

    try {
      const blob = await DfsTenantModel.create({
        workspaceId: workspace.id,
        credentialId,
        rootId,
      });
      return new Ok(new DfsTenantResource(DfsTenantModel, blob.get()));
    } catch (err) {
      // Best effort: do not leave an unreferenced credential behind.
      await oauthAPI().deleteCredentials({ credentialsId: credentialId });
      throw err;
    }
  }

  static async fetchByWorkspace(
    auth: Authenticator
  ): Promise<DfsTenantResource | null> {
    const blob = await DfsTenantModel.findOne({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
    return blob ? new DfsTenantResource(DfsTenantModel, blob.get()) : null;
  }

  async getTenantKey(auth: Authenticator): Promise<Result<string, Error>> {
    assert(
      this.workspaceId === auth.getNonNullableWorkspace().id,
      "Dfs tenant does not belong to the authenticated workspace."
    );
    const credential = await oauthAPI().getCredentials({
      credentialsId: this.credentialId,
    });
    if (credential.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch the dfs tenant key: ${credential.error.message}`
        )
      );
    }
    const content = DfsTenantCredentialsSchema.safeParse(
      credential.value.credential.content
    );
    if (!content.success) {
      return new Err(new Error("Invalid dfs tenant credential content."));
    }
    return new Ok(content.data.tenant_key);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await DfsTenantModel.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    // Best effort, once the row no longer references the credential.
    await oauthAPI().deleteCredentials({ credentialsId: this.credentialId });
    return new Ok(undefined);
  }

  // Workspace hard deletion: rows reference the workspace with `ON DELETE RESTRICT`.
  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const tenant = await DfsTenantResource.fetchByWorkspace(auth);
    await tenant?.delete(auth);
  }

  toLogJSON() {
    return { id: this.id, workspaceId: this.workspaceId, rootId: this.rootId };
  }
}
