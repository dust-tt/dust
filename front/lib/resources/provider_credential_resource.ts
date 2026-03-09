import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, ModelStatic } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
export interface ProviderCredentialResource
  extends ReadonlyAttributesType<ProviderCredentialModel> {}
export class ProviderCredentialResource extends BaseResource<ProviderCredentialModel> {
  static model: ModelStaticWorkspaceAware<ProviderCredentialModel> =
    ProviderCredentialModel;

  constructor(
    model: ModelStatic<ProviderCredentialModel>,
    blob: Attributes<ProviderCredentialModel>
  ) {
    super(ProviderCredentialModel, blob);
  }

  get sId(): string {
    return makeSId("provider_credential", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  private static async baseFetch(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    const plan = auth.getNonNullablePlan();
    assert(plan.isByok, "BYOK is not enabled on this workspace's plan.");

    const workspace = auth.getNonNullableWorkspace();

    const models = await this.model.findAll({
      where: { workspaceId: workspace.id },
      order: [["createdAt", "DESC"]],
    });

    return models.map(
      (m) => new ProviderCredentialResource(ProviderCredentialModel, m.get())
    );
  }

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    return this.baseFetch(auth);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await ProviderCredentialModel.destroy({
      where: { workspaceId: workspace.id },
    });
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number | undefined, Error>> {
    try {
      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toJSON(): ProviderCredentialType {
    return {
      sId: this.sId,
      id: this.id,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      providerId: this.providerId,
      credentialId: this.credentialId,
      isHealthy: this.isHealthy,
      placeholder: this.placeholder,
      editedByUserId: this.editedByUserId,
    };
  }
}
