import type { Authenticator } from "@app/lib/auth";
import { ConversationSelectedSpaceModel } from "@app/lib/models/agent/conversation_selected_space";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationSelectedSpaceResource
  extends ReadonlyAttributesType<ConversationSelectedSpaceModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationSelectedSpaceResource extends BaseResource<ConversationSelectedSpaceModel> {
  static model: ModelStaticWorkspaceAware<ConversationSelectedSpaceModel> =
    ConversationSelectedSpaceModel;

  constructor(
    model: ModelStaticWorkspaceAware<ConversationSelectedSpaceModel>,
    blob: Attributes<ConversationSelectedSpaceModel>
  ) {
    super(model, blob);
  }

  static async deleteForConversation(
    auth: Authenticator,
    {
      conversation,
      transaction,
    }: {
      conversation: { id: ModelId };
      transaction?: Transaction;
    }
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
      },
      transaction,
    });
  }

  static async deleteAllBySpace(
    auth: Authenticator,
    {
      spaceModelId,
      transaction,
    }: {
      spaceModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: spaceModelId,
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number, Error>> {
    const deletedCount = await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }
}
