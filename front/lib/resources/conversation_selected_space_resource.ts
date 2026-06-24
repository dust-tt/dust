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
import { removeNulls } from "@app/types/shared/utils/general";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

function sortSelectedSpaceRowsBySelectionOrder<T extends { id: ModelId }>(
  rows: T[]
): T[] {
  // Selection order is insertion order. Reactivating a row keeps its original position.
  return [...rows].sort((left, right) => left.id - right.id);
}

// `fetchByModelIds` uses an IN query, so it does not preserve the requested id order.
function pickSpacesInModelIdOrder({
  spaces,
  orderedSpaceModelIds,
}: {
  spaces: SpaceResource[];
  orderedSpaceModelIds: ModelId[];
}): SpaceResource[] {
  const spacesByModelId = new Map(spaces.map((space) => [space.id, space]));

  return removeNulls(
    orderedSpaceModelIds.map((spaceModelId) =>
      spacesByModelId.get(spaceModelId)
    )
  );
}

function dedupeSpacesByFirstModelId(spaces: SpaceResource[]): SpaceResource[] {
  const seenSpaceModelIds = new Set<ModelId>();
  const uniqueSpaces: SpaceResource[] = [];

  for (const space of spaces) {
    if (seenSpaceModelIds.has(space.id)) {
      continue;
    }

    seenSpaceModelIds.add(space.id);
    uniqueSpaces.push(space);
  }

  return uniqueSpaces;
}

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

    return sortSelectedSpaceRowsBySelectionOrder(rows).map(
      (row) => new this(this.model, row.get())
    );
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
    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      selectedSpaceModelIds,
      { transaction }
    );

    return pickSpacesInModelIdOrder({
      spaces,
      orderedSpaceModelIds: selectedSpaceModelIds,
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
      const uniqueSpaces = dedupeSpacesByFirstModelId(spaces);
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
      const orderedExistingRows =
        sortSelectedSpaceRowsBySelectionOrder(existingRows);
      const existingSpaceModelIds = new Set(
        existingRows.map((row) => row.spaceId)
      );
      const reactivatedRows = orderedExistingRows.filter(
        (row) => row.removedAt !== null
      );
      const reactivatedSpaceModelIds = reactivatedRows.map(
        (row) => row.spaceId
      );
      const reactivatedRowModelIds = reactivatedRows.map((row) => row.id);
      const missingSpaces = uniqueSpaces.filter(
        (space) => !existingSpaceModelIds.has(space.id)
      );
      let createdSpaceModelIds: ModelId[] = [];

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
        createdSpaceModelIds = createdRows
          .filter((row) => Number.isInteger(row.id))
          .map((row) => row.spaceId);
      }

      if (reactivatedRowModelIds.length > 0) {
        await this.model.update(
          {
            selectedByUserId: user.id,
            origin,
            removedAt: null,
          },
          {
            where: {
              workspaceId: workspace.id,
              id: {
                [Op.in]: reactivatedRowModelIds,
              },
            },
            transaction: t,
          }
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
        selectedSpaces: sortSelectedSpaceRowsBySelectionOrder(selectedRows).map(
          (row) => new this(this.model, row.get())
        ),
        createdSpaces: pickSpacesInModelIdOrder({
          spaces: uniqueSpaces,
          orderedSpaceModelIds: createdSpaceModelIds,
        }),
        reactivatedSpaces: pickSpacesInModelIdOrder({
          spaces: uniqueSpaces,
          orderedSpaceModelIds: reactivatedSpaceModelIds,
        }),
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
    const spaceModelIds = dedupeSpacesByFirstModelId(spaces).map(
      (space) => space.id
    );

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
