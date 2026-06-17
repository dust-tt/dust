import type { Authenticator } from "@app/lib/auth";
import type { ConversationSelectedSpaceOrigin } from "@app/lib/models/agent/conversation_selected_space";
import { ConversationSelectedSpaceModel } from "@app/lib/models/agent/conversation_selected_space";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

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

  static async listByConversation(
    auth: Authenticator,
    {
      conversation,
      activeOnly = true,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      activeOnly?: boolean;
      transaction?: Transaction;
    }
  ): Promise<ConversationSelectedSpaceResource[]> {
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        ...(activeOnly ? { removedAt: null } : {}),
      },
      transaction,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async listActiveSpacesByConversation(
    auth: Authenticator,
    {
      conversation,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      transaction?: Transaction;
    }
  ): Promise<SpaceResource[]> {
    const selectedSpaces = await this.listByConversation(auth, {
      conversation,
      transaction,
    });

    return SpaceResource.fetchByModelIds(
      auth,
      selectedSpaces.map((selectedSpace) => selectedSpace.spaceId),
      { transaction }
    );
  }

  static async upsertForConversation(
    auth: Authenticator,
    {
      conversation,
      spaces,
      origin,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      spaces: SpaceResource[];
      origin: ConversationSelectedSpaceOrigin;
      transaction?: Transaction;
    }
  ): Promise<{
    selectedSpaces: ConversationSelectedSpaceResource[];
    newlySelectedSpaces: SpaceResource[];
  }> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const spaceModelIds = spaces.map((space) => space.id);

    const existingRows = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        spaceId: {
          [Op.in]: spaceModelIds,
        },
      },
      transaction,
    });
    const existingSpaceModelIds = new Set(
      existingRows.map((row) => row.spaceId)
    );

    const newlySelectedSpaces = spaces.filter(
      (space) => !existingSpaceModelIds.has(space.id)
    );

    if (newlySelectedSpaces.length > 0) {
      await this.model.bulkCreate(
        newlySelectedSpaces.map((space) => ({
          workspaceId: workspace.id,
          conversationId: conversation.id,
          spaceId: space.id,
          selectedByUserId: user.id,
          origin,
          removedAt: null,
        })),
        { ignoreDuplicates: true, transaction }
      );
    }

    const reactivatedRows = existingRows.filter(
      (row) => row.removedAt !== null
    );
    for (const row of reactivatedRows) {
      await row.update(
        {
          selectedByUserId: user.id,
          origin,
          removedAt: null,
        },
        { transaction }
      );
    }

    const selectedRows = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        spaceId: {
          [Op.in]: spaceModelIds,
        },
      },
      transaction,
    });

    return {
      selectedSpaces: selectedRows.map(
        (row) => new this(this.model, row.get())
      ),
      newlySelectedSpaces,
    };
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number, Error>> {
    const deletedCount = await this.model.destroy({
      where: { id: this.id },
      transaction,
    });

    return new Ok(deletedCount);
  }
}
