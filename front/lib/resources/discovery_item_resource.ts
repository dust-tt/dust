import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupPinnedItemType } from "@app/lib/resources/storage/models/group_pinned_items";
import {
  GROUP_PINNED_ITEM_TYPES,
  GroupPinnedItemModel,
} from "@app/lib/resources/storage/models/group_pinned_items";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

const MAX_GROUP_PINNED_ITEMS = 3;

export type PinnedDiscoveryItemInput = {
  type: GroupPinnedItemType;
  itemId: string;
  position: number;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DiscoveryItemResource
  extends ReadonlyAttributesType<GroupPinnedItemModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DiscoveryItemResource extends BaseResource<GroupPinnedItemModel> {
  static model: ModelStaticWorkspaceAware<GroupPinnedItemModel> =
    GroupPinnedItemModel;

  constructor(
    model: ModelStaticWorkspaceAware<GroupPinnedItemModel>,
    blob: Attributes<GroupPinnedItemModel>
  ) {
    super(model, blob);
  }

  private static async baseFetch(
    auth: Authenticator,
    {
      groupModelIds,
      transaction,
    }: {
      groupModelIds: ModelId[];
      transaction?: Transaction;
    }
  ): Promise<DiscoveryItemResource[]> {
    if (groupModelIds.length === 0) {
      return [];
    }

    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: { [Op.in]: groupModelIds },
      },
      order: [["position", "ASC"]],
      transaction,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  /**
   * @cc [owner:frankaloia,label:security;product] pinned-items-auth-groups
   * A caller only sees pins for groups in its authenticated group snapshot. Within each position,
   * the workspace-global group's pin comes first.
   */
  static async listPinnedForAuth(
    auth: Authenticator
  ): Promise<DiscoveryItemResource[]> {
    const groupModelIds = auth.groupModelIds();
    const rows = await this.baseFetch(auth, { groupModelIds });
    const globalGroupModelId = await auth.getGlobalGroupModelId();
    const orderedGroupModelIds = [
      ...(globalGroupModelId !== null &&
      groupModelIds.includes(globalGroupModelId)
        ? [globalGroupModelId]
        : []),
      ...groupModelIds.filter((groupId) => groupId !== globalGroupModelId),
    ];
    const groupRank = new Map(
      orderedGroupModelIds.map((groupId, index) => [groupId, index])
    );

    return rows.sort(
      (a, b) =>
        a.position - b.position ||
        (groupRank.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) -
          (groupRank.get(b.groupId) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  /**
   * @cc [owner:frankaloia,label:security] pinned-items-group-read
   * A regular user can list pins for a group only when that group is in its authenticated group
   * snapshot. Workspace managers and admins can list pins for any group in their workspace.
   */
  static async listPinnedForGroup(
    auth: Authenticator,
    {
      groupId,
      transaction,
    }: {
      groupId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<DiscoveryItemResource[]> {
    if (!auth.isManager() && !auth.groupModelIds().includes(groupId)) {
      return [];
    }

    return this.baseFetch(auth, {
      groupModelIds: [groupId],
      transaction,
    });
  }

  static async deleteAllForItem(
    auth: Authenticator,
    {
      type,
      itemId,
      transaction,
    }: {
      type: GroupPinnedItemType;
      itemId: string;
      transaction?: Transaction;
    }
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        type,
        itemId,
      },
      transaction,
    });
  }

  /**
   * @cc [owner:frankaloia,label:product] pinned-item-cap
   * A group has at most 3 pinned items, one at each position from 0 through 2.
   */
  /**
   * @cc [owner:frankaloia,label:product] pinned-item-partial-update
   * Setting one pin preserves every other position. It replaces the selected position and moves the same item from any previous position.
   */
  /**
   * @cc [owner:frankaloia,label:product] pinned-item-artefact-unique
   * The same agent or skill is pinned at most once in a group.
   */
  static async setPinnedForGroup(
    auth: Authenticator,
    {
      groupId,
      item,
      transaction,
    }: {
      groupId: ModelId;
      item: PinnedDiscoveryItemInput;
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      DiscoveryItemResource,
      DustError<"invalid_request_error" | "group_not_found" | "unauthorized">
    >
  > {
    const validation = validatePinnedItem(item);
    if (validation.isErr()) {
      return validation;
    }
    if (!auth.isManager()) {
      return unauthorizedPinMutation();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    return withTransaction(async (t) => {
      const group = await GroupModel.findOne({
        where: {
          id: groupId,
          workspaceId,
        },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!group) {
        return new Err(
          new DustError("group_not_found", "Group not found in this workspace.")
        );
      }

      await this.model.destroy({
        where: {
          workspaceId,
          groupId,
          [Op.or]: [
            { position: item.position },
            { type: item.type, itemId: item.itemId },
          ],
        },
        transaction: t,
      });

      const row = await this.model.create(
        {
          workspaceId,
          groupId,
          type: item.type,
          itemId: item.itemId,
          position: item.position,
        },
        { transaction: t }
      );
      return new Ok(new this(this.model, row.get()));
    }, transaction);
  }

  static async removePinnedForGroup(
    auth: Authenticator,
    {
      groupId,
      position,
      transaction,
    }: {
      groupId: ModelId;
      position: number;
      transaction?: Transaction;
    }
  ): Promise<
    Result<number, DustError<"invalid_request_error" | "unauthorized">>
  > {
    if (!isPinnedPosition(position)) {
      return invalidPositionError();
    }
    if (!auth.isManager()) {
      return unauthorizedPinMutation();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const deletedCount = await this.model.destroy({
      where: {
        workspaceId,
        groupId,
        position,
      },
      transaction,
    });
    return new Ok(deletedCount);
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
}

function validatePinnedItem(
  item: PinnedDiscoveryItemInput
): Result<undefined, DustError<"invalid_request_error">> {
  if (!isPinnedPosition(item.position)) {
    return invalidPositionError();
  }

  if (!GROUP_PINNED_ITEM_TYPES.includes(item.type)) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Discovery item type must be agent or skill."
      )
    );
  }

  if (item.itemId.length === 0) {
    return new Err(
      new DustError("invalid_request_error", "Discovery item ID is required.")
    );
  }

  return new Ok(undefined);
}

function invalidPositionError(): Err<DustError<"invalid_request_error">> {
  return new Err(
    new DustError(
      "invalid_request_error",
      `Pinned discovery item positions must be integers between 0 and ${
        MAX_GROUP_PINNED_ITEMS - 1
      }.`
    )
  );
}

function unauthorizedPinMutation(): Err<DustError<"unauthorized">> {
  return new Err(
    new DustError(
      "unauthorized",
      "Only workspace managers and admins can manage pinned discovery items."
    )
  );
}

function isPinnedPosition(position: number): boolean {
  return (
    Number.isInteger(position) &&
    position >= 0 &&
    position < MAX_GROUP_PINNED_ITEMS
  );
}
