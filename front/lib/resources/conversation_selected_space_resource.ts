import type { Authenticator } from "@app/lib/auth";
import type { ConversationSelectedSpaceOrigin } from "@app/lib/models/agent/conversation_selected_space";
import { ConversationSelectedSpaceModel } from "@app/lib/models/agent/conversation_selected_space";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import uniqBy from "lodash/uniqBy";
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

    const selectedSpaceModelIds = selectedSpaces.map(
      (selectedSpace) => selectedSpace.spaceId
    );
    // Fetch through SpaceResource so the returned spaces include their groups.
    return SpaceResource.fetchByModelIds(auth, selectedSpaceModelIds, {
      transaction,
    });
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
    createdSpaces: SpaceResource[];
    reactivatedSpaces: SpaceResource[];
  }> {
    return withTransaction(async (t) => {
      const workspace = auth.getNonNullableWorkspace();
      const user = auth.getNonNullableUser();
      const uniqueSpaces = uniqBy(spaces, "id");
      const spaceModelIds = uniqueSpaces.map((space) => space.id);

      if (spaceModelIds.length === 0) {
        return {
          selectedSpaces: [],
          createdSpaces: [],
          reactivatedSpaces: [],
        };
      }

      const existingRows = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          conversationId: conversation.id,
          spaceId: {
            [Op.in]: spaceModelIds,
          },
        },
        transaction: t,
      });
      const existingSpaceModelIds = new Set(
        existingRows.map((row) => row.spaceId)
      );
      const removedRows = existingRows.filter((row) => row.removedAt !== null);
      const missingSpaces = uniqueSpaces.filter(
        (space) => !existingSpaceModelIds.has(space.id)
      );
      let createdSpaceModelIds = new Set<ModelId>();

      if (missingSpaces.length > 0) {
        const createdRows = await this.model.bulkCreate(
          missingSpaces.map((space) => ({
            workspaceId: workspace.id,
            conversationId: conversation.id,
            spaceId: space.id,
            selectedByUserId: user.id,
            origin,
            removedAt: null,
          })),
          { ignoreDuplicates: true, transaction: t }
        );

        // With `ignoreDuplicates`, rows skipped by a concurrent insert come back without an id.
        createdSpaceModelIds = new Set(
          createdRows
            .filter((row) => Number.isInteger(row.id))
            .map((row) => row.spaceId)
        );
      }

      let reactivatedSpaceModelIds = new Set<ModelId>();
      if (removedRows.length > 0) {
        const [, reactivatedRows] = await this.model.update(
          {
            selectedByUserId: user.id,
            origin,
            removedAt: null,
          },
          {
            where: {
              workspaceId: workspace.id,
              id: {
                [Op.in]: removedRows.map((row) => row.id),
              },
            },
            transaction: t,
            returning: true,
          }
        );
        reactivatedSpaceModelIds = new Set(
          reactivatedRows.map((row) => row.spaceId)
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
        transaction: t,
      });

      return {
        selectedSpaces: selectedRows.map(
          (row) => new this(this.model, row.get())
        ),
        createdSpaces: uniqueSpaces.filter((space) =>
          createdSpaceModelIds.has(space.id)
        ),
        reactivatedSpaces: uniqueSpaces.filter((space) =>
          reactivatedSpaceModelIds.has(space.id)
        ),
      };
    }, transaction);
  }

  static async removeForConversation(
    auth: Authenticator,
    {
      conversation,
      spaces,
      transaction,
    }: {
      conversation: { id: ModelId };
      spaces: SpaceResource[];
      transaction?: Transaction;
    }
  ): Promise<number> {
    const spaceModelIds = uniqBy(spaces, "id").map((space) => space.id);

    if (spaceModelIds.length === 0) {
      return 0;
    }

    const [updatedCount] = await this.model.update(
      { removedAt: new Date() },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          removedAt: null,
          spaceId: {
            [Op.in]: spaceModelIds,
          },
        },
        transaction,
      }
    );

    return updatedCount;
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
