import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { GroupPinnedItemType } from "@app/lib/resources/storage/models/group_pinned_items";
import {
  GROUP_PINNED_ITEM_TYPES,
  GroupPinnedItemModel,
} from "@app/lib/resources/storage/models/group_pinned_items";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { DiscoveryItemType } from "@app/types/api/discovery";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

const MAX_GROUP_PINNED_ITEMS = 3;

export type PinnedDiscoveryItemInput = {
  type: GroupPinnedItemType;
  itemId: string;
  position: number;
};

export type ResolvedDiscoveryItem = {
  type: GroupPinnedItemType;
  pin: DiscoveryItemResource;
  target: AgentResource | SkillResource;
  toJSON: () => DiscoveryItemType;
};

type DiscoveryTargetByType = {
  agent: AgentResource;
  skill: SkillResource;
};

type DiscoveryTargetHandler<K extends GroupPinnedItemType> = {
  fetchAccessible: (
    auth: Authenticator,
    ids: string[]
  ) => Promise<Map<string, DiscoveryTargetByType[K]>>;
  toItem: (
    pin: DiscoveryItemResource,
    target: DiscoveryTargetByType[K]
  ) => ResolvedDiscoveryItem;
};

// One entry per pinned target. `GROUP_PINNED_ITEM_TYPES` requires every type to be present, and
// each entry's card must match `DiscoveryItemType`, so a new type is added here and in that union.
const discoveryTargets: {
  [K in GroupPinnedItemType]: DiscoveryTargetHandler<K>;
} = {
  agent: {
    fetchAccessible: fetchAccessibleAgents,
    toItem: agentDiscoveryItem,
  },
  skill: {
    fetchAccessible: fetchAccessibleSkills,
    toItem: skillDiscoveryItem,
  },
};

function visitDiscoveryTarget<R>(
  type: GroupPinnedItemType,
  visit: <K extends GroupPinnedItemType>(
    handler: DiscoveryTargetHandler<K>
  ) => R
): R {
  switch (type) {
    case "agent":
      return visit(discoveryTargets.agent);
    case "skill":
      return visit(discoveryTargets.skill);
    default:
      return assertNever(type);
  }
}

async function fetchAccessibleAgents(auth: Authenticator, ids: string[]) {
  const agents = await AgentResource.fetchByIds(auth, ids);
  return new Map(
    agents
      .filter((agent) => agent.status === "active" && auth.can("read", agent))
      .map((agent) => [agent.sId, agent])
  );
}

async function fetchAccessibleSkills(auth: Authenticator, ids: string[]) {
  const skills = await SkillResource.fetchByIds(auth, ids, {
    onlyActive: true,
    permissionFiltering: "strict",
    withFileAttachments: false,
    withInstructions: false,
    withTools: false,
  });
  return new Map(skills.map((skill) => [skill.sId, skill]));
}

function discoveryPinJSON(pin: DiscoveryItemResource) {
  return {
    groupId: GroupResource.modelIdToSId({
      id: pin.groupId,
      workspaceId: pin.workspaceId,
    }),
    position: pin.position,
  };
}

function agentDiscoveryItem(
  pin: DiscoveryItemResource,
  target: AgentResource
): ResolvedDiscoveryItem {
  return {
    type: "agent",
    pin,
    target,
    toJSON: () => ({
      type: "agent",
      pin: discoveryPinJSON(pin),
      target: {
        sId: target.sId,
        name: target.name,
        description: target.description,
        pictureUrl: target.pictureUrl,
      },
    }),
  };
}

function skillDiscoveryItem(
  pin: DiscoveryItemResource,
  target: SkillResource
): ResolvedDiscoveryItem {
  return {
    type: "skill",
    pin,
    target,
    toJSON: () => ({
      type: "skill",
      pin: discoveryPinJSON(pin),
      target: {
        sId: target.sId,
        name: target.name,
        description: target.userFacingDescription,
        icon: target.icon ?? null,
      },
    }),
  };
}

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
   * @cc [owner:frankaloia,label:security;product] pinned-discovery-item-access
   * User-facing pin reads MUST resolve targets through the target Resource with strict caller
   * permissions and omit missing, inactive, or unreadable targets.
   */
  /**
   * @cc [owner:frankaloia,label:security;product] pinned-discovery-item-admin-target
   * Admin pin writes MUST resolve an active, readable target through the target Resource's normal
   * permission checks.
   */
  private static async resolveAccessibleTargets(
    auth: Authenticator,
    items: DiscoveryItemResource[]
  ): Promise<ResolvedDiscoveryItem[]> {
    const indexedPins = items.map((pin, index) => ({ index, pin }));
    const resolved = (
      await Promise.all(
        GROUP_PINNED_ITEM_TYPES.map((type) =>
          visitDiscoveryTarget(type, async (handler) => {
            const pins = indexedPins.filter(({ pin }) => pin.type === type);
            const targetsById = await handler.fetchAccessible(
              auth,
              pins.map(({ pin }) => pin.itemId)
            );
            return removeNulls(
              pins.map(({ index, pin }) => {
                const target = targetsById.get(pin.itemId);
                return target
                  ? { index, item: handler.toItem(pin, target) }
                  : null;
              })
            );
          })
        )
      )
    ).flat();

    return resolved.sort((a, b) => a.index - b.index).map(({ item }) => item);
  }

  static toJSON(item: ResolvedDiscoveryItem): DiscoveryItemType {
    return item.toJSON();
  }

  /**
   * @cc [owner:frankaloia,label:security;product] pinned-items-auth-groups
   * A caller only sees pins for groups in its authenticated group snapshot. Within each position,
   * the workspace-global group's pin comes first.
   */
  static async listPinnedForAuth(
    auth: Authenticator
  ): Promise<ResolvedDiscoveryItem[]> {
    const groupModelIds = auth.groupModelIds();
    const [items, globalGroupModelId] = await Promise.all([
      this.baseFetch(auth, { groupModelIds }),
      auth.getGlobalGroupModelId(),
    ]);
    const rows = await this.resolveAccessibleTargets(auth, items);
    const orderedGroupModelIds = [
      ...(globalGroupModelId !== null &&
      groupModelIds.includes(globalGroupModelId)
        ? [globalGroupModelId]
        : []),
      ...groupModelIds.filter(
        (groupModelId) => groupModelId !== globalGroupModelId
      ),
    ];
    const groupRank = new Map(
      orderedGroupModelIds.map((groupModelId, index) => [groupModelId, index])
    );

    return rows.sort(
      (a, b) =>
        a.pin.position - b.pin.position ||
        (groupRank.get(a.pin.groupId) ?? Number.MAX_SAFE_INTEGER) -
          (groupRank.get(b.pin.groupId) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  /**
   * @cc [owner:frankaloia,label:security] pinned-items-group-read
   * A regular user can list pins for a group only when that group is in its authenticated group
   * snapshot. Workspace admins can list pins for any group in their workspace. Target visibility
   * always follows the target Resource's normal permissions.
   */
  static async listPinnedForGroup(
    auth: Authenticator,
    {
      groupModelId,
      transaction,
    }: {
      groupModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<ResolvedDiscoveryItem[]> {
    if (!auth.isAdmin() && !auth.groupModelIds().includes(groupModelId)) {
      return [];
    }

    const items = await this.baseFetch(auth, {
      groupModelIds: [groupModelId],
      transaction,
    });
    return this.resolveAccessibleTargets(auth, items);
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
  /**
   * @cc [owner:frankaloia,label:product] pinned-item-group-kind
   * A pin can be set only on a group that is not `regular_auto`. Implicit groups, such as agent
   * editors and space members, are not discovery audiences.
   */
  static async setPinnedForGroup(
    auth: Authenticator,
    {
      groupModelId,
      item,
      transaction,
    }: {
      groupModelId: ModelId;
      item: PinnedDiscoveryItemInput;
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      ResolvedDiscoveryItem,
      DustError<"invalid_request_error" | "group_not_found" | "unauthorized">
    >
  > {
    const validation = validatePinnedItem(item);
    if (validation.isErr()) {
      return validation;
    }
    if (!auth.isAdmin()) {
      return unauthorizedPinMutation();
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;

    return visitDiscoveryTarget(item.type, async (handler) => {
      const target = (await handler.fetchAccessible(auth, [item.itemId])).get(
        item.itemId
      );
      if (!target) {
        return new Err(
          new DustError(
            "invalid_request_error",
            "Pinned discovery items must reference an active agent or skill in this workspace."
          )
        );
      }

      return withTransaction(async (t) => {
        const group = await GroupModel.findOne({
          where: {
            id: groupModelId,
            workspaceId: workspaceModelId,
          },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });
        if (!group) {
          return new Err(
            new DustError(
              "group_not_found",
              "Group not found in this workspace."
            )
          );
        }
        if (group.kind === "regular_auto") {
          return new Err(
            new DustError(
              "invalid_request_error",
              "Pinned discovery items cannot target regular_auto groups."
            )
          );
        }

        await this.model.destroy({
          where: {
            workspaceId: workspaceModelId,
            groupId: groupModelId,
            [Op.or]: [
              { position: item.position },
              { type: item.type, itemId: item.itemId },
            ],
          },
          transaction: t,
        });

        const row = await this.model.create(
          {
            workspaceId: workspaceModelId,
            groupId: groupModelId,
            type: item.type,
            itemId: item.itemId,
            position: item.position,
          },
          { transaction: t }
        );
        return new Ok(handler.toItem(new this(this.model, row.get()), target));
      }, transaction);
    });
  }

  static async removePinnedForGroup(
    auth: Authenticator,
    {
      groupModelId,
      position,
      transaction,
    }: {
      groupModelId: ModelId;
      position: number;
      transaction?: Transaction;
    }
  ): Promise<
    Result<number, DustError<"invalid_request_error" | "unauthorized">>
  > {
    if (!isPinnedPosition(position)) {
      return invalidPositionError();
    }
    if (!auth.isAdmin()) {
      return unauthorizedPinMutation();
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const deletedCount = await this.model.destroy({
      where: {
        workspaceId: workspaceModelId,
        groupId: groupModelId,
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
    if (!auth.isAdmin()) {
      return unauthorizedPinMutation();
    }

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
      "Only workspace admins can manage pinned discovery items."
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
