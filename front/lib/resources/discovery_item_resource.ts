import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { grantTypesForVerb } from "@app/lib/resources/group_permission_registry";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupPinnedItemModel } from "@app/lib/resources/storage/models/group_pinned_items";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { DiscoveryItemType } from "@app/types/api/discovery";
import type { GroupPinnedItemType } from "@app/types/discovery";
import { GROUP_PINNED_ITEM_TYPES } from "@app/types/discovery";
import type { GrantType } from "@app/types/group_permissions";
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

export type ResolvedDiscoveryItem =
  | {
      type: "agent";
      pin: DiscoveryItemResource;
      target: AgentResource;
      toJSON: () => DiscoveryItemType;
    }
  | {
      type: "skill";
      pin: DiscoveryItemResource;
      target: SkillResource;
      toJSON: () => DiscoveryItemType;
    };

function discoveryPinJSON(pin: DiscoveryItemResource) {
  return {
    groupId: GroupResource.modelIdToSId({
      id: pin.groupId,
      workspaceId: pin.workspaceId,
    }),
    position: pin.position,
  };
}

function isDiscoverableAgent(agent: AgentResource): boolean {
  return (
    agent.status === "active" &&
    (agent.scope === "visible" || agent.scope === "global")
  );
}

function hasReadableDiscoveryTarget(
  auth: Authenticator,
  item: { type: GroupPinnedItemType; itemId: string },
  agentsById: Map<string, AgentResource>,
  skillsById: Map<string, SkillResource>
): boolean {
  switch (item.type) {
    case "agent": {
      const agent = agentsById.get(item.itemId);
      return !!agent && auth.can("read", agent);
    }
    case "skill": {
      const skill = skillsById.get(item.itemId);
      return !!skill && auth.can("read", skill);
    }
    default:
      return assertNever(item.type);
  }
}

function resolvedDiscoveryItem(
  pin: DiscoveryItemResource,
  agentsById: Map<string, AgentResource>,
  skillsById: Map<string, SkillResource>
): ResolvedDiscoveryItem | null {
  switch (pin.type) {
    case "agent": {
      const target = agentsById.get(pin.itemId);
      if (!target) {
        return null;
      }
      return {
        type: "agent",
        pin,
        target,
        toJSON: () => ({
          type: "agent",
          pin: discoveryPinJSON(pin),
          target: target.toDiscoveryJSON(),
        }),
      };
    }
    case "skill": {
      const target = skillsById.get(pin.itemId);
      if (!target) {
        return null;
      }
      return {
        type: "skill",
        pin,
        target,
        toJSON: () => ({
          type: "skill",
          pin: discoveryPinJSON(pin),
          target: target.toDiscoveryJSON(),
        }),
      };
    }
    default:
      return assertNever(pin.type);
  }
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
   * @cc [label:security;product] discovery-target-loading
   * Loaded targets MUST omit missing, inactive, and non-discoverable targets (unpublished agents).
   * For workspace admins, loaded targets MAY include agents or redacted skills the admin cannot
   * read. Callers MUST check `auth.can("read", target)` before exposing a target to a user, unless
   * a documented admin exception applies, such as [pinned-items-group-read].
   */
  static async loadTargets(
    auth: Authenticator,
    items: Array<{ type: GroupPinnedItemType; itemId: string }>
  ): Promise<{
    agentsById: Map<string, AgentResource>;
    skillsById: Map<string, SkillResource>;
  }> {
    const agentIds = items
      .filter((item) => item.type === "agent")
      .map((item) => item.itemId);
    const skillIds = items
      .filter((item) => item.type === "skill")
      .map((item) => item.itemId);

    const [agents, skills] = await Promise.all([
      AgentResource.fetchByIds(auth, agentIds),
      SkillResource.fetchByIds(auth, skillIds, {
        onlyActive: true,
        permissionFiltering: auth.isAdmin() ? "redact_unreadable" : "strict",
        withFileAttachments: false,
        withInstructions: false,
        withTools: false,
      }),
    ]);

    return {
      agentsById: new Map(
        agents
          .filter(
            (agent) =>
              isDiscoverableAgent(agent) &&
              (auth.isAdmin() || auth.can("read", agent))
          )
          .map((agent) => [agent.sId, agent])
      ),
      skillsById: new Map(skills.map((skill) => [skill.sId, skill])),
    };
  }

  private static async resolveTargets(
    auth: Authenticator,
    items: DiscoveryItemResource[]
  ): Promise<ResolvedDiscoveryItem[]> {
    const { agentsById, skillsById } = await this.loadTargets(auth, items);
    return removeNulls(
      items.map((pin) => resolvedDiscoveryItem(pin, agentsById, skillsById))
    );
  }

  static toJSON(item: ResolvedDiscoveryItem): DiscoveryItemType {
    return item.toJSON();
  }

  /**
   * @cc [owner:frankaloia,label:security;product] pinned-discovery-item-access
   * User-facing pin reads MUST resolve targets through the target Resource with strict caller
   * permissions and omit missing, inactive, hidden, or unreadable targets.
   */
  /**
   * @cc [owner:frankaloia,label:security;product] pinned-items-auth-groups
   * A caller only sees pins for groups in its authenticated group snapshot. Within each position,
   * the workspace-global group's pin comes first.
   */
  static async listPinnedForAuth(
    auth: Authenticator
  ): Promise<ResolvedDiscoveryItem[]> {
    const groupModelIds = await auth.listPrincipalGroupModelIds();
    const [items, globalGroupModelId] = await Promise.all([
      this.baseFetch(auth, { groupModelIds }),
      auth.getGlobalGroupModelId(),
    ]);
    const rows = await omitPinsTheGroupCannotRead(
      auth,
      (await this.resolveTargets(auth, items)).filter((item) =>
        auth.can("read", item.target)
      )
    );
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
   * snapshot, and only for targets they can read. Workspace admins can list pins for any group in
   * their workspace. A workspace manager can list pins for a group only when that group is in its
   * authenticated group snapshot. A pin is omitted when the group's members can no longer read
   * every requested space through that group's grants or the workspace-global group's grants.
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
    const canManage = await canManagePinsForGroup(auth, groupModelId);
    if (
      !canManage &&
      !(await auth.listPrincipalGroupModelIds()).includes(groupModelId)
    ) {
      return [];
    }

    const items = await this.baseFetch(auth, {
      groupModelIds: [groupModelId],
      transaction,
    });
    return omitPinsTheGroupCannotRead(
      auth,
      (await this.resolveTargets(auth, items)).filter((item) =>
        auth.can("read", item.target)
      )
    );
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
   * @cc [owner:frankaloia,label:security;product] pinned-discovery-item-admin-target
   * Pin writes MUST resolve an active, readable target through the target Resource's normal
   * permission checks. An agent pin MUST be visible or global. Every member of the target group
   * MUST be able to read every requested space through that group's grants or the workspace-global
   * group's grants. Workspace admins may write for any group. A workspace manager may write only
   * for a group in its authenticated group snapshot.
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
    if (!(await canManagePinsForGroup(auth, groupModelId))) {
      return unauthorizedPinMutation();
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const { agentsById, skillsById } = await this.loadTargets(auth, [item]);
    const target =
      item.type === "agent"
        ? agentsById.get(item.itemId)
        : skillsById.get(item.itemId);
    const requestedSpaceModelIds = requestedSpaceModelIdsForTarget(
      item,
      agentsById,
      skillsById
    );
    if (
      !target ||
      requestedSpaceModelIds === null ||
      !hasReadableDiscoveryTarget(auth, item, agentsById, skillsById)
    ) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "Pinned discovery items must reference an active visible agent or an active skill in this workspace."
        )
      );
    }
    const [groupCanReadTarget] = await groupsCanReadRequestedSpaces(auth, [
      { groupModelId, requestedSpaceModelIds },
    ]);
    if (!groupCanReadTarget) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "This group can't open this agent or skill. In Space settings, add the group to each restricted space it uses, or pin it for a group that already has access."
        )
      );
    }

    return withTransaction(async (t) => {
      const group = await GroupModel.findOne({
        where: {
          id: groupModelId,
          workspaceId: workspaceModelId,
        },
        transaction: t,
      });
      if (!group) {
        return new Err(
          new DustError("group_not_found", "Group not found in this workspace.")
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
      const resolved = resolvedDiscoveryItem(
        new this(this.model, row.get()),
        agentsById,
        skillsById
      );
      if (!resolved) {
        return new Err(
          new DustError(
            "invalid_request_error",
            "Pinned discovery items must reference an active visible agent or an active skill in this workspace."
          )
        );
      }
      return new Ok(resolved);
    }, transaction);
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
    if (!(await canManagePinsForGroup(auth, groupModelId))) {
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
    if (!(await canManagePinsForGroup(auth, this.groupId))) {
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

async function omitPinsTheGroupCannotRead(
  auth: Authenticator,
  items: ResolvedDiscoveryItem[]
): Promise<ResolvedDiscoveryItem[]> {
  const canRead = await groupsCanReadRequestedSpaces(
    auth,
    items.map((item) => ({
      groupModelId: item.pin.groupId,
      requestedSpaceModelIds: requestedSpaceModelIdsForItem(item),
    }))
  );

  return items.filter((_, index) => canRead[index]);
}

async function groupsCanReadRequestedSpaces(
  auth: Authenticator,
  requests: Array<{
    groupModelId: ModelId;
    requestedSpaceModelIds: readonly ModelId[];
  }>
): Promise<boolean[]> {
  const requestedSpaceModelIds = [
    ...new Set(requests.flatMap((request) => request.requestedSpaceModelIds)),
  ];
  if (requestedSpaceModelIds.length === 0) {
    return requests.map(() => true);
  }

  const spaces = await SpaceResource.fetchByModelIds(
    auth,
    requestedSpaceModelIds
  );
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));
  const grantReferencesBySpaceModelId =
    await SpaceResource.listGrantReferencesBySpaceModelId(spaces);
  const globalGroupModelId = await auth.getGlobalGroupModelId();
  const readableGrantTypes = new Set<GrantType>(
    grantTypesForVerb("space", "read", "instance")
  );

  return requests.map((request) =>
    request.requestedSpaceModelIds.every((spaceModelId) => {
      if (!spaceByModelId.has(spaceModelId)) {
        return false;
      }

      return (grantReferencesBySpaceModelId.get(spaceModelId) ?? []).some(
        (grant) =>
          (grant.groupId === request.groupModelId ||
            grant.groupId === globalGroupModelId) &&
          readableGrantTypes.has(grant.grantType)
      );
    })
  );
}

function requestedSpaceModelIdsForItem(
  item: ResolvedDiscoveryItem
): readonly ModelId[] {
  switch (item.type) {
    case "agent":
      return item.target.requestedSpaceModelIds();
    case "skill":
      return item.target.requestedSpaceIds;
    default:
      return assertNever(item);
  }
}

function requestedSpaceModelIdsForTarget(
  item: Pick<PinnedDiscoveryItemInput, "type" | "itemId">,
  agentsById: Map<string, AgentResource>,
  skillsById: Map<string, SkillResource>
): readonly ModelId[] | null {
  switch (item.type) {
    case "agent":
      return agentsById.get(item.itemId)?.requestedSpaceModelIds() ?? null;
    case "skill":
      return skillsById.get(item.itemId)?.requestedSpaceIds ?? null;
    default:
      return assertNever(item.type);
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

async function canManagePinsForGroup(
  auth: Authenticator,
  groupModelId: ModelId
): Promise<boolean> {
  if (auth.isAdmin()) {
    return true;
  }
  if (!auth.isManager()) {
    return false;
  }
  return (await auth.listPrincipalGroupModelIds()).includes(groupModelId);
}

function unauthorizedPinMutation(): Err<DustError<"unauthorized">> {
  return new Err(
    new DustError(
      "unauthorized",
      "Only workspace admins, or managers who belong to the group, can manage pinned discovery items."
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
