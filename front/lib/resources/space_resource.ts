import { isDatabaseFileSystemPodName } from "@app/lib/api/file_system/storage_mode";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConcreteGrantType } from "@app/lib/resources/group_permission_registry";
import { grantTypesForVerb } from "@app/lib/resources/group_permission_registry";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import tracer from "@app/logger/tracer";
import type {
  GrantSpec,
  GrantType,
  GrantVerb,
} from "@app/types/group_permissions";
import {
  grantKey,
  SPACE_EDITOR_GRANT_TYPE,
  SPACE_MEMBER_GRANT_TYPE,
} from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import {
  GLOBAL_SPACE_NAME,
  isManageableGroupKind,
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";
import type {
  AccessControlList,
  RoleGrant,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { EnrichedSpaceType, SpaceKind, SpaceType } from "@app/types/space";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Includeable,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op, Sequelize } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SpaceResource extends ReadonlyAttributesType<SpaceModel> {}

/**
 * Lightweight representation of a space's associated group. Carries only what the space's grant row
 * holds — the group id and the grant type it confers — so it can be built straight from a
 * `group_permissions` row.
 */
export class SpaceGroupReference {
  constructor(
    readonly groupId: ModelId,
    readonly grantType: GrantType,
    readonly workspaceId: ModelId
  ) {}

  static fromGrant(grant: GroupPermissionModel): SpaceGroupReference {
    return new SpaceGroupReference(
      grant.groupId,
      grant.grantType,
      grant.workspaceId
    );
  }

  get groupSId(): string {
    return GroupResource.modelIdToSId({
      id: this.groupId,
      workspaceId: this.workspaceId,
    });
  }

  // A `reader` grant is read-only (viewer) access. It is held by the workspace global group, and
  // only by it, on open spaces — regular and project alike — where it is attached as a viewer.
  // Presence of any reader grant therefore means the space is open; such groups never confer
  // membership by themselves.
  isReader(): boolean {
    return this.grantType === "reader";
  }
}

// Space membership resolved from the caller's governance grants (see `SpaceResource.isMember`). The
// membership verb differs by space kind:
// - Regular spaces treat everyone who can read as a member: on an open space that is the whole
//   workspace, through the global group's `reader`. Membership there is about visibility, and the
//   member group's `write` is a capability on top of it.
// - Project (pod) spaces attach the workspace global group as a `reader` viewer on unrestricted
//   projects, so `read` would count every workspace member as a member. `write` is held only by a
//   project's editor (`admin`) and member (`member`) groups, so it is what marks an actual member.
const REGULAR_SPACE_MEMBERSHIP_VERB: GrantVerb = "read";
const POD_SPACE_MEMBERSHIP_VERB: GrantVerb = "write";

// The instance-level space grant types that confer each kind's membership verb, resolved once from
// the registry (the single source of truth). Used by the batch membership check so it mirrors
// `isMember` — a member is whoever holds the space's membership verb — instead of reasoning about
// grant types (reader/member/...) by hand.
const REGULAR_MEMBERSHIP_GRANT_TYPES: ReadonlySet<GrantType> = new Set(
  grantTypesForVerb("space", REGULAR_SPACE_MEMBERSHIP_VERB, "instance")
);
const POD_MEMBERSHIP_GRANT_TYPES: ReadonlySet<GrantType> = new Set(
  grantTypesForVerb("space", POD_SPACE_MEMBERSHIP_VERB, "instance")
);

// The "no memberships" fallback used by batch membership resolution.
const EMPTY_GROUP_MODEL_IDS: ReadonlySet<ModelId> = new Set();

// A space's grant-derived serialization fields, loaded on demand from `group_permissions` (see
// `listSpaceEnrichmentBySpaceModelId`) and passed to `toJSONEnriched`.
type SpaceGrantEnrichment = {
  groupIds: string[];
  isRestricted: boolean;
};

// The enrichment for a space with no grants loaded (used as the fallback when serializing).
const EMPTY_SPACE_GRANT_ENRICHMENT: SpaceGrantEnrichment = {
  groupIds: [],
  isRestricted: false,
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
function memberGrant(space: SpaceResource): GrantSpec {
  return {
    grantType: SPACE_MEMBER_GRANT_TYPE,
    resourceType: "space",
    resourceId: space.id,
  };
}

export class SpaceResource extends BaseResource<SpaceModel> {
  static model: ModelStaticSoftDeletable<SpaceModel> = SpaceModel;

  // Memoized manual editor group. A space's editor group identity is immutable, so it is resolved
  // from `group_permissions` at most once per instance. `undefined` = not yet resolved; `null` =
  // resolved to "no manual editor group" (non-project space, or provisioned mode).
  private cachedManualEditorGroup?: GroupResource | null;

  constructor(
    model: ModelStaticSoftDeletable<SpaceModel>,
    blob: Attributes<SpaceModel>
  ) {
    super(SpaceModel, blob);
  }

  static fromModel(space: SpaceModel) {
    return new SpaceResource(SpaceModel, space.get());
  }

  /**
   * Project-only: when true, workspace admins are the only people with
   * editor/admin powers. Enabling demotes editors to members; disabling
   * promotes the oldest member back to editor.
   *
   * Fetched on demand from project_metadata (not joined on every space load).
   */
  async fetchIsAdminControlled(): Promise<boolean> {
    if (!this.isProject()) {
      return false;
    }

    const metadata = await ProjectMetadataModel.findOne({
      attributes: ["isAdminControlled"],
      where: {
        spaceId: this.id,
        workspaceId: this.workspaceId,
      },
    });

    return metadata?.isAdminControlled ?? false;
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<SpaceModel>,
    groups: { members: GroupResource[]; editors?: GroupResource[] },
    transaction?: Transaction
  ) {
    return withTransaction(async (t: Transaction) => {
      const space = await SpaceModel.create(blob, { transaction: t });
      const { members, editors = [] } = groups;

      if (editors.length > 0) {
        assert(
          blob.kind === "project",
          "Only projects can have editor groups."
        );
      }

      const spaceResource = new this(SpaceModel, space.get());

      // Write group_permissions directly from the in-hand groups, so a space is never
      // persisted without its grants. `auth` only needs to be in the space's workspace: the write
      // itself authorizes nothing (see `writeGroupPermissions`); who may create a space is gated by
      // the callers (`makeDefaultsForWorkspace`, `createSpaceAndGroup`).
      await spaceResource.writeGroupPermissions(auth, {
        members,
        editors,
        transaction: t,
      });

      return spaceResource;
    }, transaction);
  }

  static async makeDefaultsForWorkspace(
    auth: Authenticator,
    {
      systemGroup,
      globalGroup,
    }: {
      systemGroup: GroupResource;
      globalGroup: GroupResource;
    },
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only admins can call `makeDefaultsForWorkspace`");

    const existingSpaces = await this.listWorkspaceDefaultSpaces(auth, {
      includeConversationsSpace: true,
    });
    const systemSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isSystem()) ||
      (await SpaceResource.makeNew(
        auth,
        {
          name: "System",
          kind: "system",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [systemGroup] },
        transaction
      ));

    const globalSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isGlobal()) ||
      (await SpaceResource.makeNew(
        auth,
        {
          name: GLOBAL_SPACE_NAME,
          kind: "global",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [globalGroup] },
        transaction
      ));

    const conversationsSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isConversations()) ||
      (await SpaceResource.makeNew(
        auth,
        {
          name: "Conversations",
          kind: "conversations",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [globalGroup] },
        transaction
      ));

    return {
      systemSpace,
      globalSpace,
      conversationsSpace,
    };
  }

  get sId(): string {
    return SpaceResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("space", {
      id,
      workspaceId,
    });
  }

  // This space's grant references, loaded from `group_permissions` on demand. The space's grants
  // are their own source of truth; loading here (rather than an eager include on every space fetch)
  // keeps space loads cheap. Use `listGrantReferencesBySpaceModelId` when resolving several spaces.
  async fetchGrantReferences(
    transaction?: Transaction
  ): Promise<SpaceGroupReference[]> {
    const grants = await GroupPermissionModel.findAll({
      where: {
        workspaceId: this.workspaceId,
        resourceType: "space",
        resourceId: this.id,
      },
      transaction,
    });

    return grants.map(SpaceGroupReference.fromGrant);
  }

  // The grant references for each of `spaces`, keyed by space model id — one `group_permissions`
  // query for the whole batch (avoids the N+1 of `fetchGrantReferences` per space).
  static async listGrantReferencesBySpaceModelId(
    spaces: SpaceResource[]
  ): Promise<Map<ModelId, SpaceGroupReference[]>> {
    const referencesBySpaceModelId = new Map<ModelId, SpaceGroupReference[]>();
    if (spaces.length === 0) {
      return referencesBySpaceModelId;
    }

    const grants = await GroupPermissionModel.findAll({
      where: {
        workspaceId: [...new Set(spaces.map((space) => space.workspaceId))],
        resourceType: "space",
        resourceId: spaces.map((space) => space.id),
      },
    });

    for (const grant of grants) {
      const reference = SpaceGroupReference.fromGrant(grant);
      const existing = referencesBySpaceModelId.get(grant.resourceId);
      if (existing) {
        existing.push(reference);
      } else {
        referencesBySpaceModelId.set(grant.resourceId, [reference]);
      }
    }

    return referencesBySpaceModelId;
  }

  async fetchGroupResources(
    auth: Authenticator,
    {
      groupReferences,
      transaction,
    }: {
      groupReferences?: SpaceGroupReference[];
      transaction?: Transaction;
    } = {}
  ): Promise<GroupResource[]> {
    const references =
      groupReferences ?? (await this.fetchGrantReferences(transaction));
    if (references.length === 0) {
      return [];
    }

    const groups = await GroupResource.dangerouslyFetchByModelIds(
      auth,
      references.map((group) => group.groupId),
      { transaction }
    );
    const groupsById = new Map(groups.map((group) => [group.id, group]));

    return references.map((group) => {
      const resource = groupsById.get(group.groupId);
      assert(resource, `Group ${group.groupSId} not found.`);
      return resource;
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    {
      includes,
      limit,
      order,
      where,
      includeDeleted,
    }: ResourceFindOptions<SpaceModel> = {},
    t?: Transaction
  ) {
    const includeClauses: Includeable[] = [
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ...(includes || []),
    ];

    const spacesModels = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<SpaceModel>,
      include: includeClauses,
      limit,
      order,
      includeDeleted,
      transaction: t,
    });

    return spacesModels.map(this.fromModel);
  }

  static async listWorkspaceSpaces(
    auth: Authenticator,
    options?: {
      includeConversationsSpace?: boolean;
      includeProjectSpaces?: boolean;
      includeDeleted?: boolean;
      includeOpen?: boolean;
      includeRestricted?: boolean;
    },
    t?: Transaction
  ): Promise<SpaceResource[]> {
    return tracer.trace("listWorkspaceSpaces", async () => {
      const spaces = await this.baseFetch(
        auth,
        {
          includeDeleted: options?.includeDeleted,
          where: {
            kind: {
              [Op.in]: [
                "system",
                "global",
                "regular",
                ...(options?.includeConversationsSpace
                  ? ["conversations"]
                  : []),
                ...(options?.includeProjectSpaces ? ["project"] : []),
              ],
            },
          },
        },
        t
      );

      const includeOpen = options?.includeOpen ?? true;
      const includeRestricted = options?.includeRestricted ?? true;
      assert(
        includeOpen || includeRestricted,
        "listWorkspaceSpaces: at least one of includeOpen / includeRestricted must be true."
      );
      if (includeOpen && includeRestricted) {
        return spaces;
      }

      // Openness is determined by the presence of a reader grant for the
      // workspace global group; resolved for regular/project spaces only.
      const regularOrProject = spaces.filter(
        (space) => space.isRegular() || space.isProject()
      );
      const openIds = await this.listOpenSpaceModelIds(auth, regularOrProject);

      return spaces.filter((space) => {
        if (!space.isRegular() && !space.isProject()) {
          return true;
        }
        const open = openIds.has(space.id);
        return open ? includeOpen : includeRestricted;
      });
    });
  }

  static async listWorkspaceSpacesAsMember(
    auth: Authenticator,
    options?: { kinds?: SpaceKind[] }
  ) {
    return tracer.trace("listWorkspaceSpacesAsMember", async () => {
      const spaces = await this.baseFetch(auth, {
        where: options?.kinds
          ? { kind: { [Op.in]: options.kinds } }
          : undefined,
      });

      // TODO(projects): we might want to filter early on the groups membership to avoid fetching all spaces and then filtering.
      return spaces.filter((s) => s.isMember(auth));
    });
  }

  static async listWorkspacePodsAsMember(auth: Authenticator) {
    // Project (pod) spaces the caller belongs to are those on which they hold the pod membership
    // verb (see `POD_SPACE_MEMBERSHIP_VERB`): selecting by it and `kind: "project"` reproduces the
    // former `group_vaults` member/editor lookup, so the previous safety re-filter is redundant.
    // A type-wide grant makes the caller a member of every pod (`isMember` says so too), so it
    // drops the id filter rather than the whole result.
    const podSpaces = auth.getResourceIdsWithVerb(
      "space",
      POD_SPACE_MEMBERSHIP_VERB
    );
    if (podSpaces.kind === "ids" && podSpaces.resourceIds.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: {
        ...(podSpaces.kind === "ids"
          ? { id: { [Op.in]: podSpaces.resourceIds } }
          : {}),
        kind: "project",
      },
    });
  }

  static async listProjectSpaces(
    auth: Authenticator
  ): Promise<SpaceResource[]> {
    return this.baseFetch(auth, {
      where: { kind: "project" },
    });
  }

  static async searchProjectsByNamePaginated(
    auth: Authenticator,
    {
      query,
      pagination,
    }: {
      query?: string;
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection: "asc" | "desc";
      };
    }
  ): Promise<{
    spaces: SpaceResource[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    const cursorOperator = pagination.orderDirection === "desc" ? Op.lt : Op.gt;

    const fetchLimit = pagination.limit + 1;
    const orderDirection =
      pagination.orderDirection === "desc" ? "DESC" : "ASC";

    const spaces = await this.baseFetch(auth, {
      where: {
        kind: "project",
        ...(query?.trim() && { name: { [Op.iLike]: `%${query}%` } }),
        ...(pagination.lastValue && {
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn("LOWER", Sequelize.col("spaces.name")),
              cursorOperator,
              pagination.lastValue.toLowerCase()
            ),
          ],
        }),
      },
      order: [[Sequelize.literal(`LOWER("spaces"."name")`), orderDirection]],
      limit: fetchLimit,
    });

    const hasMore = spaces.length > pagination.limit;
    const resultSpaces = hasMore ? spaces.slice(0, pagination.limit) : spaces;

    const lastSpace = resultSpaces[resultSpaces.length - 1];
    const lastValue = lastSpace?.name ?? null;

    return {
      spaces: resultSpaces.filter((space) => auth.can("read", space)),
      hasMore,
      lastValue,
    };
  }

  static async listWorkspaceDefaultSpaces(
    auth: Authenticator,
    options?: { includeConversationsSpace?: boolean }
  ) {
    return this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: [
            "system",
            "global",
            ...(options?.includeConversationsSpace ? ["conversations"] : []),
          ],
        },
      },
    });
  }

  static async listForGroups(
    auth: Authenticator,
    groups: (GroupResource | GroupType)[],
    options?: { includeConversationsSpace?: boolean }
  ) {
    // The spaces these groups have any grant on (group -> spaces direction), from group_permissions.
    // Served by the (workspaceId, groupId) index; resourceType pins it to space grants.
    const spaceGrants = await GroupPermissionModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: groups.map((g) => g.id),
        resourceType: "space",
      },
      attributes: ["resourceId"],
    });
    const grantedSpaceModelIds = [
      ...new Set(spaceGrants.map((grant) => grant.resourceId)),
    ];

    const allExceptConversations: Exclude<SpaceKind, "conversations">[] = [
      "system",
      "global",
      "regular",
      "project",
    ];

    let spaces: SpaceResource[] = [];

    if (options?.includeConversationsSpace) {
      spaces = await this.baseFetch(auth, {
        where: {
          id: grantedSpaceModelIds,
        },
      });
    } else {
      spaces = await this.baseFetch(auth, {
        where: {
          id: grantedSpaceModelIds,
          kind: {
            [Op.in]: allExceptConversations,
          },
        },
      });
    }

    return spaces.filter((space) => auth.can("read", space));
  }

  static async canAdministrateSystemSpace(auth: Authenticator) {
    const systemSpace = await this.fetchWorkspaceSystemSpace(auth);
    return auth.can("admin", systemSpace);
  }

  static async fetchWorkspaceSystemSpace(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<SpaceResource> {
    return tracer.trace("fetchWorkspaceSystemSpace", async () => {
      const [space] = await this.baseFetch(
        auth,
        { where: { kind: "system" } },
        transaction
      );

      if (!space) {
        throw new Error("System space not found.");
      }

      return space;
    });
  }

  static async fetchWorkspaceGlobalSpace(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<SpaceResource> {
    return tracer.trace("fetchWorkspaceGlobalSpace", async () => {
      const [space] = await this.baseFetch(
        auth,
        { where: { kind: "global" } },
        transaction
      );

      if (!space) {
        throw new Error("Global space not found.");
      }

      return space;
    });
  }

  static async fetchWorkspaceConversationsSpace(
    auth: Authenticator
  ): Promise<SpaceResource> {
    return tracer.trace("fetchWorkspaceConversationsSpace", async () => {
      const [space] = await this.baseFetch(auth, {
        where: { kind: "conversations" },
      });

      if (!space) {
        throw new Error("Conversations space not found.");
      }

      return space;
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<SpaceResource | null> {
    const [space] = await this.fetchByIds(auth, [sId], { includeDeleted });
    return space ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    {
      includeDeleted,
      transaction,
    }: { includeDeleted?: boolean; transaction?: Transaction } = {}
  ): Promise<SpaceResource[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.baseFetch(
      auth,
      {
        where: {
          id: removeNulls(ids.map(getResourceIdFromSId)),
        },
        includeDeleted,
      },
      transaction
    );
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    {
      includeDeleted,
      transaction,
    }: { includeDeleted?: boolean; transaction?: Transaction } = {}
  ) {
    if (ids.length === 0) {
      return [];
    }

    const spaces = await this.baseFetch(
      auth,
      {
        where: {
          id: {
            [Op.in]: ids,
          },
        },
        includeDeleted,
      },
      transaction
    );

    return spaces ?? [];
  }

  static async dangerouslyFetchByModelIds(
    spaceModelIds: ModelId[]
  ): Promise<SpaceResource[]> {
    if (spaceModelIds.length === 0) {
      return [];
    }

    // WORKSPACE_ISOLATION_BYPASS: The sandbox reaper operates across
    // workspaces. The ids come from workspace-scoped sandbox ownership rows.
    const spaces = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        id: {
          [Op.in]: spaceModelIds,
        },
      },
      includeDeleted: true,
    });

    return spaces.map(this.fromModel);
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    t?: Transaction
  ): Promise<SpaceResource | null> {
    const trimmedName = name.trim();
    const [space] = await this.baseFetch(
      auth,
      { where: { name: { [Op.iLike]: trimmedName } } },
      t
    );
    return space ?? null;
  }

  static async isNameAvailable(
    auth: Authenticator,
    name: string,
    t?: Transaction
  ): Promise<boolean> {
    const space = await this.fetchByName(auth, name, t);
    return !space;
  }

  async delete(
    auth: Authenticator,
    options: { hardDelete: boolean; transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const { hardDelete, transaction } = options;
    // Only the space's own auto-created (regular_auto) groups are deleted with it. The workspace
    // global group and provisioned (IdP-owned) groups are shared and left untouched, so they are
    // excluded here rather than relying on the association-count guard below.
    const groupsToMaybeDelete = await this.fetchRegularAutoGroups(
      auth,
      transaction
    );

    await GroupPermissionResource.deleteAllForResource(auth, {
      resourceType: "space",
      resourceId: this.id,
      transaction,
    });

    // Groups and spaces are currently tied together in a 1-1 way, even though the model allow a n-n relation between them.
    // When deleting a space, we delete the dangling groups as it won't be available in the UI anymore.
    // This should be changed when we separate the management of groups and spaces
    await concurrentExecutor(
      groupsToMaybeDelete,
      async (group) => {
        // Ensure the group is not associated with any other space. The grants for this space were
        // just cleared above, so any remaining space grant means the group is used elsewhere.
        const grants = await GroupPermissionResource.listForGroup(
          auth,
          group,
          transaction
        );
        const hasSpaceGrant = grants.some(
          (grant) => grant.resourceType === "space"
        );
        if (!hasSpaceGrant) {
          await group.delete(auth, { transaction });
        }
      },
      {
        concurrency: 8,
      }
    );

    await AgentProjectConfigurationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectId: this.id,
      },
      transaction,
    });

    const workspaceId = auth.getNonNullableWorkspace().id;
    const projectContentFragmentIds = await ContentFragmentModel.findAll({
      attributes: ["id"],
      where: {
        spaceId: this.id,
        workspaceId,
      },
      transaction,
    }).then((rows) => rows.map((r) => r.id));

    if (projectContentFragmentIds.length > 0) {
      const messagesReferencing = await MessageModel.findAll({
        attributes: ["contentFragmentId"],
        where: {
          workspaceId,
          contentFragmentId: {
            [Op.in]: projectContentFragmentIds,
          },
        },
        transaction,
      });
      const referencedIds = new Set(
        removeNulls(messagesReferencing.map((m) => m.contentFragmentId))
      );
      const orphanIds = projectContentFragmentIds.filter(
        (id) => !referencedIds.has(id)
      );
      if (orphanIds.length > 0) {
        await ContentFragmentModel.destroy({
          where: {
            id: { [Op.in]: orphanIds },
            workspaceId,
          },
          transaction,
        });
      }
      await ContentFragmentModel.update(
        { spaceId: null },
        {
          where: {
            spaceId: this.id,
            workspaceId,
          },
          transaction,
        }
      );
    }

    if (hardDelete) {
      await SandboxOwnerModel.destroy({
        where: {
          spaceId: this.id,
          workspaceId,
        },
        transaction,
      });

      // Pod-scoped env var rows only — workspace rows have spaceId NULL.
      await SandboxEnvVarModel.destroy({
        where: {
          spaceId: this.id,
          workspaceId,
        },
        transaction,
      });
    }

    await SpaceModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
      hardDelete,
    });

    return new Ok(undefined);
  }

  async updateName(
    auth: Authenticator,
    newName: string
  ): Promise<Result<undefined, Error>> {
    if (!auth.can("admin", this)) {
      return new Err(new Error("Only admins can update space names."));
    }

    const trimmedName = newName.trim();
    if (
      this.isProject() &&
      isDatabaseFileSystemPodName(this.name) !==
        isDatabaseFileSystemPodName(trimmedName)
    ) {
      return new Err(
        new Error(
          "A Pod cannot add or remove the database filesystem prefix after creation."
        )
      );
    }
    const existingSpace = await SpaceResource.fetchByName(auth, trimmedName);
    if (existingSpace && existingSpace.id !== this.id) {
      return new Err(new Error("This space name is already used."));
    }

    await this.update({ name: trimmedName });
    if (this.isRegular() || this.isProject()) {
      // For regular spaces that only have a single group, update
      // the group's name too (see https://github.com/dust-tt/tasks/issues/1738)
      const regularGroup = await this.fetchManualMemberGroup(auth);
      const memberRenameRes = await regularGroup.dangerouslyUpdateName(
        `${this.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${this.name}`
      );
      if (memberRenameRes.isErr()) {
        return memberRenameRes;
      }

      if (this.isProject()) {
        const spaceEditorGroup = await this.fetchManualEditorGroup(auth);
        if (spaceEditorGroup) {
          const editorRenameRes = await spaceEditorGroup.dangerouslyUpdateName(
            `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`
          );
          if (editorRenameRes.isErr()) {
            return editorRenameRes;
          }
        }
      }
    }

    return new Ok(undefined);
  }

  // Permissions.

  async updatePermissions(
    auth: Authenticator,
    params: {
      name: string;
      isRestricted: boolean;
    } & (
      | { memberIds: string[]; managementMode: "manual"; editorIds: string[] }
      | {
          groupIds: string[];
          managementMode: "group";
          editorGroupIds: string[];
        }
    )
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "group_not_found"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "invalid_group_kind"
        | "system_or_global_group"
        | "invalid_id"
      >
    >
  > {
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to update space permissions."
        )
      );
    }

    if (!this.isRegular() && !this.isProject()) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only projects and regular spaces can have members."
        )
      );
    }

    const { isRestricted } = params;

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;

    const result = await withTransaction(async (t) => {
      // Update managementMode if provided
      const { managementMode } = params;

      // The space is open (unrestricted) exactly when the workspace global group is one of its
      // groups. There is no separate group_vaults add/remove: the global group is simply included in
      // `members` iff the space is (becoming) open.
      const willBeOpen = !isRestricted;

      const previousManagementMode = this.managementMode;
      await this.update({ managementMode }, t);

      // Handle member status updates based on management mode changes
      if (previousManagementMode !== managementMode) {
        if (managementMode === "group") {
          // When switching to group mode, suspend all active members of the default group
          await this.suspendManualGroupMembers(auth, t);
        } else if (
          managementMode === "manual" &&
          previousManagementMode === "group"
        ) {
          // When switching from group to manual mode, restore suspended members
          await this.restoreManualGroupMembers(auth, t);
        }
      }

      // The desired member/editor group sets for this space, written once into group_permissions at
      // the end of the transaction (or on an early membership-mutation error, so the grants still
      // reflect the group associations).
      const members: GroupResource[] = [];
      const editors: GroupResource[] = [];
      const syncGroupPermissions = async () =>
        this.writeGroupPermissions(auth, { members, editors, transaction: t });

      if (managementMode === "manual") {
        const memberIds = params.memberIds;
        const editorIds = params.editorIds;

        assert(
          memberIds.every((id) => !editorIds.includes(id)),
          "A user cannot be both a member and an editor of the same space."
        );

        const isAdminControlled = await this.fetchIsAdminControlled();

        // Admin-controlled Pods have an empty editor group; workspace admins
        // administrate via role. Reject any attempt to set editors.
        if (isAdminControlled && this.isProject()) {
          if (editorIds.length > 0) {
            return new Err(
              new DustError(
                "unauthorized",
                "Editors cannot be set while this Pod is admin-controlled."
              )
            );
          }
        }

        // Handle member-based management
        const users = await UserResource.fetchByIds(memberIds);

        const memberGroup = await this.fetchManualMemberGroup(auth, t);
        members.push(memberGroup);
        if (willBeOpen) {
          members.push(globalGroup);
        }

        // Handle editor group - create if needed and update members
        if (this.isProject()) {
          let editorGroup = await this.fetchManualEditorGroup(auth, t);
          if (!editorGroup) {
            // Create a new editor group (no group_vaults row; the grant is written below).
            editorGroup = await GroupResource.makeNew(
              {
                name: `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`,
                kind: "regular_auto",
                workspaceId: this.workspaceId,
              },
              { transaction: t }
            );
          }
          editors.push(editorGroup);
        }

        const setMembersRes = await memberGroup.dangerouslySetMembers(auth, {
          users: users.map((u) => u.toJSON()),
          transaction: t,
        });
        if (setMembersRes.isErr()) {
          await syncGroupPermissions();
          return setMembersRes;
        }

        if (this.isProject()) {
          const [editorGroup] = editors;
          const editorUsers = await UserResource.fetchByIds(editorIds);
          assert(
            editorUsers.length > 0 || isAdminControlled,
            "Pods must have at least one editor."
          );
          const setEditorsRes = await editorGroup.dangerouslySetMembers(auth, {
            users: editorUsers.map((u) => u.toJSON()),
            transaction: t,
          });
          if (setEditorsRes.isErr()) {
            await syncGroupPermissions();
            return setEditorsRes;
          }
        }
      } else if (managementMode === "group") {
        // Handle group-based management
        const groupIds = params.groupIds;
        const editorGroupIds = params.editorGroupIds;

        // The space's regular_auto member group (and, for projects, its regular_auto editor group)
        // are kept alongside the selected provisioned groups — group mode adds provisioned grants on
        // top of the manual groups rather than replacing them. Deselecting a group removes its
        // access for free: writeGroupPermissions rewrites the space's whole grant set from the
        // members/editors accumulated here.
        const memberGroup = await this.fetchManualMemberGroup(auth, t);
        members.push(memberGroup);
        if (willBeOpen) {
          members.push(globalGroup);
        }

        // Add the new groups
        const selectedGroupsResult = await GroupResource.fetchByIds(
          auth,
          groupIds
        );
        if (selectedGroupsResult.isErr()) {
          await syncGroupPermissions();
          return selectedGroupsResult;
        }
        const selectedGroups = selectedGroupsResult.value;
        // `fetchByIds` only checks that the caller can read the groups, not what they are. Without
        // this, any readable group could be attached: the global group (which would silently make
        // the space open), another space's regular_auto group (two of those on one space breaks
        // `fetchManualMemberGroup`), or an agent/skill editors group.
        const unsupportedGroups = selectedGroups.filter(
          (group) => !isManageableGroupKind(group.kind)
        );
        if (unsupportedGroups.length > 0) {
          await syncGroupPermissions();
          return new Err(
            new DustError(
              "invalid_group_kind",
              "Only provisioned and manual groups can be given access to a space."
            )
          );
        }
        members.push(...selectedGroups);

        if (this.isProject()) {
          const manualEditorGroup = await this.fetchManualEditorGroup(auth, t);
          if (manualEditorGroup) {
            editors.push(manualEditorGroup);
          }

          assert(
            editorGroupIds.length > 0,
            "Pods must have at least one editor group."
          );
          // Add the new editor groups
          const editorGroupsResult = await GroupResource.fetchByIds(
            auth,
            editorGroupIds
          );
          if (editorGroupsResult.isErr()) {
            await syncGroupPermissions();
            return editorGroupsResult;
          }
          const selectedEditorGroups = editorGroupsResult.value;
          assert(
            selectedEditorGroups.length > 0,
            "Pods must have at least one editor group."
          );
          // Same as above: an unsupported editor group kind must be a rejected request, not a 500.
          const unsupportedEditorGroups = selectedEditorGroups.filter(
            (group) => !isManageableGroupKind(group.kind)
          );
          if (unsupportedEditorGroups.length > 0) {
            await syncGroupPermissions();
            return new Err(
              new DustError(
                "invalid_group_kind",
                "Only provisioned and manual groups can be given access to a space."
              )
            );
          }
          editors.push(...selectedEditorGroups);
        }
      }

      // Write the updated group associations into group_permissions
      await syncGroupPermissions();

      return new Ok(undefined);
    });

    // Opening/closing the space or changing its groups rewrote `group_permissions` (and possibly the
    // caller's own membership), so the group set and grants `auth` resolved at construction are now
    // stale. Refresh the caller's snapshot now that the write has committed — no transaction, so the
    // re-read sees the committed rows and the `afterCommit`-invalidated cache — so any later
    // permission check in the same request (e.g. the post-update read check in the members handler)
    // sees the new state instead of a pre-mutation view.
    await auth.refresh();

    return result;
  }

  /**
   * When enabling admin-controlled mode: demote all editors to members.
   * When disabling: promote the oldest member to editor.
   * Caller must update project metadata separately; this only adjusts groups.
   */
  async applyAdminControlledMembershipChange(
    auth: Authenticator,
    isAdminControlled: boolean,
    transaction?: Transaction
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    assert(this.isProject(), "Only projects support admin-controlled mode.");
    assert(
      this.managementMode === "manual",
      "Admin-controlled mode requires manual membership management."
    );

    if (!auth.isAdmin()) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only workspace admins can change admin-controlled Pod mode."
        )
      );
    }

    return withTransaction(async (t: Transaction) => {
      const editorGroup = await this.fetchManualEditorGroup(auth, t);
      const memberGroup = await this.fetchManualMemberGroup(auth, t);
      assert(editorGroup, "A project must have a manual editor group.");

      if (isAdminControlled) {
        const editors = await editorGroup.getActiveMembers(auth, {
          transaction: t,
        });
        if (editors.length === 0) {
          return new Ok(undefined);
        }

        const members = await memberGroup.getActiveMembers(auth, {
          transaction: t,
        });
        const existingMemberSIds = new Set(members.map((m) => m.sId));
        const editorsToAdd = editors.filter(
          (e) => !existingMemberSIds.has(e.sId)
        );

        if (editorsToAdd.length > 0) {
          const addRes = await memberGroup.dangerouslyAddMembers(auth, {
            users: editorsToAdd.map((u) => u.toJSON()),
            transaction: t,
          });
          if (addRes.isErr()) {
            return addRes;
          }
        }

        const clearEditorsRes = await editorGroup.dangerouslySetMembers(auth, {
          users: [],
          transaction: t,
        });
        if (clearEditorsRes.isErr()) {
          return clearEditorsRes;
        }

        return new Ok(undefined);
      }

      // Disabling: promote the oldest member (by join date) to editor.
      const now = new Date();
      const memberMemberships = await GroupMembershipModel.findAll({
        where: {
          workspaceId: this.workspaceId,
          groupId: memberGroup.id,
          status: "active" as const,
          startAt: { [Op.lte]: now },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
        },
        order: [["startAt", "ASC"]],
        transaction: t,
      });
      if (memberMemberships.length === 0) {
        return new Err(
          new DustError(
            "group_requirements_not_met",
            "Cannot disable admin-controlled mode: this Pod has no members."
          )
        );
      }

      const oldestUsers = await UserResource.fetchByModelIds([
        memberMemberships[0].userId,
      ]);
      const oldestMember = oldestUsers[0];
      if (!oldestMember) {
        return new Err(new DustError("user_not_found", "User not found"));
      }

      const removeFromMembersRes = await memberGroup.dangerouslyRemoveMembers(
        auth,
        {
          users: [oldestMember.toJSON()],
          transaction: t,
        }
      );
      if (removeFromMembersRes.isErr()) {
        return removeFromMembersRes;
      }

      const setEditorRes = await editorGroup.dangerouslySetMembers(auth, {
        users: [oldestMember.toJSON()],
        transaction: t,
      });
      if (setEditorRes.isErr()) {
        return setEditorRes;
      }

      return new Ok(undefined);
    }, transaction);
  }

  async fetchActiveEditorUsers(auth: Authenticator): Promise<UserResource[]> {
    if (!this.isProject()) {
      return [];
    }

    const editorGroup = await this.fetchManualEditorGroup(auth);
    if (!editorGroup) {
      return [];
    }
    return editorGroup.getActiveMembers(auth);
  }

  async addMembers(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to add members to this space."
        )
      );
    }

    assert(
      this.isRegular() || this.isProject(),
      "Only regular spaces and projects can have manual members."
    );
    assert(
      this.managementMode === "manual",
      "Can only add members in manual management mode."
    );

    const users = await UserResource.fetchByIds(userIds);
    const foundIds = new Set(users.map((user) => user.sId));
    const missingIds = userIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      return new Err(
        new DustError(
          "user_not_found",
          `User(s) not found: ${missingIds.join(", ")}`
        )
      );
    }

    let usersToAdd = users;
    if (this.isProject()) {
      const activeEditors = await this.fetchActiveEditorUsers(auth);
      const activeEditorIds = new Set(activeEditors.map((user) => user.sId));
      usersToAdd = users.filter((user) => !activeEditorIds.has(user.sId));
      if (usersToAdd.length === 0) {
        return new Ok([]);
      }
    }

    // Authorization is the space-level admin gate above; the member group is resolved from
    // group_permissions and mutated directly.
    const memberGroup = await this.fetchManualMemberGroup(auth);

    const addMemberRes = await memberGroup.dangerouslyAddMembers(auth, {
      users: usersToAdd.map((user) => user.toJSON()),
    });

    if (addMemberRes.isErr()) {
      return addMemberRes;
    }

    return new Ok(usersToAdd);
  }

  async addEditors(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "user_not_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to add editors to this space."
        )
      );
    }

    if (await this.fetchIsAdminControlled()) {
      return new Err(
        new DustError(
          "unauthorized",
          "Editors cannot be changed while this Pod is admin-controlled."
        )
      );
    }

    assert(this.isProject(), "Only projects can have editors.");
    assert(
      this.managementMode === "manual",
      "Can only add editors in manual management mode."
    );

    const users = await UserResource.fetchByIds(userIds);
    const foundIds = new Set(users.map((user) => user.sId));
    const missingIds = userIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      return new Err(
        new DustError(
          "user_not_found",
          `User(s) not found: ${missingIds.join(", ")}`
        )
      );
    }

    const editorGroup = await this.fetchManualEditorGroup(auth);
    assert(editorGroup, "A project must have a manual editor group.");
    const activeEditors = await editorGroup.getActiveMembers(auth);
    const activeEditorIds = new Set(activeEditors.map((user) => user.sId));
    const usersToAdd = users.filter((user) => !activeEditorIds.has(user.sId));

    if (usersToAdd.length === 0) {
      return new Ok([]);
    }

    const memberGroup = await this.fetchManualMemberGroup(auth);
    const activeMembers = await memberGroup.getActiveMembers(auth);
    const activeMemberIds = new Set(activeMembers.map((user) => user.sId));
    const usersToRemoveFromMembers = usersToAdd.filter((user) =>
      activeMemberIds.has(user.sId)
    );

    if (usersToRemoveFromMembers.length > 0) {
      const removeMemberRes = await memberGroup.dangerouslyRemoveMembers(auth, {
        users: usersToRemoveFromMembers.map((user) => user.toJSON()),
      });
      if (removeMemberRes.isErr()) {
        return removeMemberRes;
      }
    }

    const addEditorRes = await editorGroup.dangerouslyAddMembers(auth, {
      users: usersToAdd.map((user) => user.toJSON()),
    });

    if (addEditorRes.isErr()) {
      return addEditorRes;
    }

    return new Ok(usersToAdd);
  }

  async removeEditors(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to remove editors from this space."
        )
      );
    }

    if (await this.fetchIsAdminControlled()) {
      return new Err(
        new DustError(
          "unauthorized",
          "Editors cannot be changed while this Pod is admin-controlled."
        )
      );
    }

    assert(this.isProject(), "Only projects can have editors.");
    assert(
      this.managementMode === "manual",
      "Can only remove editors in manual management mode."
    );

    const users = await UserResource.fetchByIds(userIds);
    if (users.length === 0) {
      return new Err(new DustError("user_not_found", "User not found"));
    }

    const editorGroup = await this.fetchManualEditorGroup(auth);
    assert(editorGroup, "A project must have a manual editor group.");
    const activeEditors = await editorGroup.getActiveMembers(auth);
    const activeEditorIds = new Set(activeEditors.map((user) => user.sId));
    const usersToRemove = users.filter((user) => activeEditorIds.has(user.sId));

    if (usersToRemove.length === 0) {
      return new Ok([]);
    }

    if (activeEditors.length - usersToRemove.length < 1) {
      return new Err(
        new DustError(
          "group_requirements_not_met",
          "Pods must have at least one editor."
        )
      );
    }

    const removeEditorRes = await editorGroup.dangerouslyRemoveMembers(auth, {
      users: usersToRemove.map((user) => user.toJSON()),
    });

    if (removeEditorRes.isErr()) {
      return removeEditorRes;
    }

    return new Ok(usersToRemove);
  }

  async removeMembers(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to remove members from this space."
        )
      );
    }

    const users = await UserResource.fetchByIds(userIds);

    if (!users) {
      return new Err(new DustError("user_not_found", "User not found"));
    }

    const memberGroup = await this.fetchManualMemberGroup(auth);

    const removeMemberRes = await memberGroup.dangerouslyRemoveMembers(auth, {
      users: users.map((user) => user.toJSON()),
    });

    if (removeMemberRes.isErr()) {
      return removeMemberRes;
    }

    return new Ok(users);
  }

  // The space's manual editor group (project spaces only): the regular_auto group holding the
  // `admin` grant on this space in `group_permissions`. Read from `group_permissions` rather than
  // `group_vaults` (being removed). Returns null for non-project spaces and for provisioned mode,
  // where the editor grant is held by a provisioned group rather than the manual editor group.
  // Memoized on the instance (see `cachedManualEditorGroup`).
  async fetchManualEditorGroup(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource | null> {
    if (!this.isProject()) {
      return null;
    }
    if (this.cachedManualEditorGroup === undefined) {
      this.cachedManualEditorGroup =
        await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
          grantType: SPACE_EDITOR_GRANT_TYPE,
          resourceType: "space",
          resourceId: this.id,
          transaction,
        });
    }
    return this.cachedManualEditorGroup;
  }

  // The space's auto-created (regular_auto) groups: its manual member group and, for projects, its
  // editor group. Resolved from `group_permissions`, filtered to regular_auto groups (a grant's
  // type alone cannot tell a regular_auto group from the global group). Present in group management
  // mode too: that mode adds the provisioned groups' grants on top of these rather than replacing
  // them (see `updatePermissions`).
  async fetchRegularAutoGroups(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource[]> {
    return GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
      resourceType: "space",
      resourceId: this.id,
      transaction,
    });
  }

  // The batched counterpart of `fetchRegularAutoGroups`: the regular_auto groups of every space in
  // `spaces`, as a flat deduped union, in two queries rather than two per space.
  static async listRegularAutoGroupsForSpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    { includeEditors = true }: { includeEditors?: boolean } = {}
  ): Promise<GroupResource[]> {
    const autoGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResources(auth, {
        resourceType: "space",
        resourceIds: spaces.map((space) => space.id),
      });

    if (includeEditors) {
      return autoGroups;
    }

    // Only projects have an editor group.
    const editorGroupsByGrant =
      await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: spaces
          .filter((space) => space.isProject())
          .map((space) => ({
            grantType: SPACE_EDITOR_GRANT_TYPE,
            resourceType: "space",
            resourceId: space.id,
          })),
      });

    const editorGroupIds = new Set(
      [...editorGroupsByGrant.values()].map((group) => group.sId)
    );
    return autoGroups.filter((group) => !editorGroupIds.has(group.sId));
  }

  static async listAutoGroupIdsBySpaceId(
    auth: Authenticator,
    spaceIds: string[]
  ): Promise<Map<string, string>> {
    const spaces = await SpaceResource.fetchByIds(auth, spaceIds);
    // System and conversations spaces have no auto group of their own.
    const membershipSpaces = spaces.filter(
      (space) => !space.isSystem() && !space.isConversations()
    );

    const [autoGroupByGrantKey, globalGroupRes] = await Promise.all([
      GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: membershipSpaces
          .filter((space) => !space.isGlobal())
          .map(memberGrant),
      }),
      GroupResource.fetchWorkspaceGlobalGroup(auth),
    ]);
    assert(globalGroupRes.isOk(), "Workspace has no global group.");

    return new Map(
      membershipSpaces.map((space) => {
        if (space.isGlobal()) {
          return [space.sId, globalGroupRes.value.sId];
        }

        const autoGroup = autoGroupByGrantKey.get(grantKey(memberGrant(space)));
        assert(autoGroup, `Space ${space.sId} has no auto group.`);

        return [space.sId, autoGroup.sId];
      })
    );
  }

  // The groups that make up this space's membership: its member group and, for projects, its editor
  // group (regular_auto in manual mode, provisioned in group mode). Groups holding only a read-only
  // (`reader`) grant are excluded — that is the workspace global group attached to an open space as
  // a viewer, which makes the space visible without making anyone a member. Use this to list who
  // actually belongs to the space.
  async fetchMembershipGroups(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource[]> {
    const groupReferences = (
      await this.fetchGrantReferences(transaction)
    ).filter((group) => !group.isReader());
    return this.fetchGroupResources(auth, { groupReferences, transaction });
  }

  // The space's manual member group: the regular_auto group holding this space's membership. A
  // project space has two regular_auto groups (member + editor), so the editor group (identified
  // by its `admin` grant in `group_permissions`) is excluded; a regular space has exactly one.
  async fetchManualMemberGroup(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource> {
    const editorGroup = await this.fetchManualEditorGroup(auth, transaction);
    const autoGroups = await this.fetchRegularAutoGroups(auth, transaction);
    const memberGroups = autoGroups.filter(
      (group) => group.id !== editorGroup?.id
    );
    assert(
      memberGroups.length === 1,
      `Expected exactly one member group for the space, but found ${memberGroups.length}.`
    );
    return memberGroups[0];
  }

  /**
   * Check if the auth is a member of this space.
   */

  isMember(auth: Authenticator): boolean {
    // Read membership from the caller's resolved space grants rather than raw group membership; the
    // grants `spaceGroupRoles` writes mirror `isMemberFromGrants` per kind (see the
    // `*_SPACE_MEMBERSHIP_VERB` constants for why the verb differs between regular and project).
    switch (this.kind) {
      // The workspace-wide space: every member belongs to it.
      case "global":
        return true;
      // System groups manage connections and the conversations space is not a membership space; the
      // group predicate returns false for both regardless of grants.
      case "system":
      case "conversations":
        return false;
      case "regular":
        return auth
          .getGrantedVerbs("space", this.id)
          .includes(REGULAR_SPACE_MEMBERSHIP_VERB);
      case "project":
        return auth
          .getGrantedVerbs("space", this.id)
          .includes(POD_SPACE_MEMBERSHIP_VERB);
      default:
        assertNever(this.kind);
    }
  }

  /**
   * For each of `userModelIds`, the subset of `spaces` they are a member of. Batches the spaces'
   * grants and the users' group memberships into two queries, then applies the same per-kind rule
   * as {@link SpaceResource.isMember}. Lets callers check many users and spaces at once without
   * building one `Authenticator` per user.
   */
  static async listMemberSpaceModelIdsByUser(
    auth: Authenticator,
    {
      spaces,
      userModelIds,
    }: { spaces: SpaceResource[]; userModelIds: ModelId[] }
  ): Promise<Map<ModelId, Set<ModelId>>> {
    const memberSpaceModelIdsByUser = new Map<ModelId, Set<ModelId>>();
    if (spaces.length === 0 || userModelIds.length === 0) {
      return memberSpaceModelIdsByUser;
    }

    const workspace = auth.getNonNullableWorkspace();

    // group_permissions is the source of truth for space access: read every space's grants in one
    // query rather than per space.
    const grants = await GroupPermissionModel.findAll({
      attributes: ["resourceId", "workspaceId", "groupId", "grantType"],
      where: {
        workspaceId: workspace.id,
        resourceType: "space",
        resourceId: spaces.map((space) => space.id),
      },
    });

    const grantsBySpaceModelId = new Map<ModelId, SpaceGroupReference[]>();
    for (const grant of grants) {
      const ref = SpaceGroupReference.fromGrant(grant);
      const refs = grantsBySpaceModelId.get(grant.resourceId);
      if (refs) {
        refs.push(ref);
      } else {
        grantsBySpaceModelId.set(grant.resourceId, [ref]);
      }
    }

    // For each user, the groups they are an active member of among the spaces' grant groups. One
    // query, whatever the number of users and spaces.
    const groupModelIdsByUser =
      await GroupResource.listGroupModelIdsByUserModelIdInWorkspace({
        workspace,
        userModelIds,
        groupModelIds: [...new Set(grants.map((grant) => grant.groupId))],
      });

    // O(users × spaces) membership resolution over already-fetched data (no DB calls in the loop).
    // Both arrays are small in practice: `spaces` is a caller-held set or a single workspace's
    // spaces (tens, well under a few hundred) and `userModelIds` is a bounded set of users (skill
    // editors, mentioned users, or an access-check request — tens to low hundreds). The inner
    // `isMemberFromGrants` scan is bounded by a space's group count (typically < 10).
    for (const userModelId of userModelIds) {
      const userGroupModelIds =
        groupModelIdsByUser.get(userModelId) ?? EMPTY_GROUP_MODEL_IDS;
      const memberSpaceModelIds = new Set<ModelId>();
      for (const space of spaces) {
        if (
          space.isMemberFromGrants(
            grantsBySpaceModelId.get(space.id) ?? [],
            userGroupModelIds
          )
        ) {
          memberSpaceModelIds.add(space.id);
        }
      }
      if (memberSpaceModelIds.size > 0) {
        memberSpaceModelIdsByUser.set(userModelId, memberSpaceModelIds);
      }
    }

    return memberSpaceModelIdsByUser;
  }

  // Batched equivalent of `isMember`: a member is whoever holds the space's membership verb. Given a
  // space's grant references and a precomputed set of the user's group model ids, the user is a
  // member iff they belong to a group whose grant confers that verb (resolved through the registry,
  // like `isMember`). Kept private and fed by `listMemberSpaceModelIdsByUser` so it needs neither an
  // `Authenticator` nor a per-space grant fetch.
  private isMemberFromGrants(
    grants: SpaceGroupReference[],
    userGroupModelIds: ReadonlySet<ModelId>
  ): boolean {
    switch (this.kind) {
      // The workspace-wide space: every member belongs to it.
      case "global":
        return true;
      // Not membership spaces (see `isMember`).
      case "conversations":
      case "system":
        return false;
      // Regular spaces check `read`, projects check `write` (see the `*_SPACE_MEMBERSHIP_VERB`
      // constants). Open spaces need no special-casing: their global-group `reader` grant confers
      // `read`, so every workspace member is a member of an open regular space, while on projects
      // that same `reader` grant does not confer `write` and therefore is not membership.
      case "regular":
      case "project": {
        const membershipGrantTypes =
          this.kind === "project"
            ? POD_MEMBERSHIP_GRANT_TYPES
            : REGULAR_MEMBERSHIP_GRANT_TYPES;
        return grants.some(
          (grant) =>
            userGroupModelIds.has(grant.groupId) &&
            membershipGrantTypes.has(grant.grantType)
        );
      }
      default:
        assertNever(this.kind);
    }
  }

  /**
   * Computes resource permissions based on space type and group configuration.
   *
   * Permission patterns by space type:
   *
   * 1. System spaces:
   * - Restricted to workspace admins only
   *
   * 2. Global spaces:
   * - Read: All workspace members
   * - Write: Workspace admins and builders
   *
   * 3. Open spaces:
   * - Read: All workspace members
   * - Write: Admins and builders
   *
   * 4. Restricted spaces:
   * - Read/Write: Group members
   * - Admin: Workspace admins
   *
   * @returns Array of AccessControlList objects based on space type
   */
  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    return [
      {
        workspaceId: this.workspaceId,
        roles: this.spaceRoleGrants(),
        // The caller's own verbs on this space, resolved from `group_permissions` (kept in sync by
        // `writeGroupPermissions`). The per-kind role rules above are unchanged.
        grantedVerbs: auth.getGrantedVerbs("space", this.id),
      },
    ];
  }

  // The verbs each workspace role holds on this space, by space kind.
  private spaceRoleGrants(): RoleGrant[] {
    // System space.
    if (this.isSystem()) {
      return [{ role: "admin", permissions: ["admin", "write"] }];
    }

    // Global Workspace space and Conversations space. Read is not granted by role: both attach the
    // workspace global group with a `reader` grant, and every workspace member belongs to that
    // group, so `group_permissions` already confers read on everyone.
    if (this.isGlobal() || this.isConversations()) {
      return [
        { role: "admin", permissions: ["admin", "write"] },
        // TODO(governance): remove once manager is available for everyone
        { role: "builder", permissions: ["write"] },
        { role: "manager", permissions: ["write"] },
      ];
    }

    // Regular spaces and projects: the role only confers administration, never read or write, and
    // an open space is treated exactly like a restricted one. Read and write come from the space's
    // grants — on an open space the global group's `reader` grant makes it visible to every
    // workspace member, and its member groups are the only source of write.
    return [{ role: "admin", permissions: ["admin"] }];
  }

  // The role each of this space's `group_vaults` associations confers, as a registry grant type.
  // This is the single mapping the governance model needs — space kind + group kind -> role — and
  // the only thing `group_permissions` stores (see `writeGroupPermissions`). Verbs are never stored:
  // they are `ROLE_REGISTRY.space`'s to expand when the table is read back.
  //
  // `associatedGroups` is the full set of groups attached to this space, and `editorGroupIds`
  // classifies which of a project's groups are editors. Both are passed in rather than loaded here:
  // callers mutate the group set in-transaction (so a fetch would be stale), and a provisioned group
  // can be an editor or a member so the group kind alone cannot tell them apart. Callers pass the
  // `{ members, editors }` set they just computed.
  private spaceGroupRoles(
    associatedGroups: GroupResource[],
    editorGroupIds: ModelId[]
  ): {
    groupId: ModelId;
    grantType: ConcreteGrantType;
  }[] {
    // System space: its groups manage the workspace's connections.
    if (this.isSystem()) {
      return associatedGroups.map((group) => ({
        groupId: group.id,
        grantType: "member",
      }));
    }

    // Global Workspace space and Conversations space: write comes from the role grants.
    if (this.isGlobal() || this.isConversations()) {
      return associatedGroups.map((group) => ({
        groupId: group.id,
        grantType: "reader",
      }));
    }

    // A manually-managed space draws its access from its own auto-created groups, plus the
    // workspace global group when it is open. The groups a user can pick in group mode —
    // provisioned and manual alike — keep their `group_vaults` rows when the space switches back to
    // manual, so they are filtered out here rather than granting in a mode that never selected them.
    const groups =
      this.managementMode === "manual"
        ? associatedGroups.filter((group) => !isManageableGroupKind(group.kind))
        : associatedGroups;

    // A space is open when the workspace global group is one of its groups.
    const isOpen = associatedGroups.some((group) => group.isGlobal());

    // Open regular space: the workspace global group is attached as a viewer, so it must only read
    // — conferring write would hand write on every open space to every workspace member. Every
    // other group is a member group and reads and writes, exactly as on a restricted space; that is
    // what makes a space's member list meaningful even when the space is open.
    if (this.isRegular() && isOpen) {
      return groups.map((group) => ({
        groupId: group.id,
        grantType: group.isGlobal() ? "reader" : "member",
      }));
    }

    if (this.isProject()) {
      const editorGroupIdSet = new Set(editorGroupIds);
      return groups.map((group) => {
        // Editors manage the project.
        if (editorGroupIdSet.has(group.id)) {
          return { groupId: group.id, grantType: SPACE_EDITOR_GRANT_TYPE };
        }
        // The workspace global group is attached to unrestricted projects as a viewer, so it must
        // only read: conferring write would hand write on every unrestricted project to every
        // workspace member.
        if (group.isGlobal()) {
          return { groupId: group.id, grantType: "reader" };
        }
        // Every other group (the manual member group, provisioned member groups) reads and writes.
        return { groupId: group.id, grantType: "member" };
      });
    }

    // Restricted regular space.
    return groups.map((group) => ({
      groupId: group.id,
      grantType: "member",
    }));
  }

  // Writes this space's `group_permissions` rows from the roles its groups confer (see
  // `spaceGroupRoles`). The space mutation paths call this to keep the table in sync as the source of
  // truth. Idempotent — it clears the space's instance grants then re-inserts the desired set in one
  // transaction.
  //
  // The caller passes the space's groups split into `members` and `editors` (the workspace global
  // group, attached to unrestricted spaces, goes in `members`) rather than this method loading them:
  // callers mutate the group set in-transaction so a fetch would be stale anyway. `editors` only
  // applies to projects.
  async writeGroupPermissions(
    auth: Authenticator,
    {
      members,
      editors,
      transaction,
    }: {
      members: GroupResource[];
      editors: GroupResource[];
      transaction?: Transaction;
    }
  ): Promise<void> {
    const associatedGroups = [...members, ...editors];
    const desiredRoles = this.spaceGroupRoles(
      associatedGroups,
      editors.map((group) => group.id)
    );

    // Clear this space's instance grants, then re-insert the desired set. `resourceId` is the space
    // id (> 0), so the type-wide governance rows (-1) are never touched.
    await GroupPermissionResource.deleteAllForResource(auth, {
      resourceType: "space",
      resourceId: this.id,
      transaction,
    });

    if (desiredRoles.length === 0) {
      return;
    }

    const groupByModelId = new Map(
      associatedGroups.map((group) => [group.id, group])
    );

    const grants = removeNulls(
      desiredRoles.map(({ groupId, grantType }) => {
        const group = groupByModelId.get(groupId);
        if (!group) {
          return null;
        }
        return {
          group,
          grantType,
          resourceType: "space" as const,
          resourceId: this.id,
        };
      })
    );

    // A regular_auto group (a space's manual member group) is the single backing group of its
    // grant tuple, so it must go through `grant()`, which takes the per-tuple lock and enforces
    // that invariant; `grantMany` rejects them. A space holds at most one, so the bulk path still
    // covers every other group.
    const autoGrants = grants.filter(({ group }) => group.isRegularAuto());
    const bulkGrants = grants.filter(({ group }) => !group.isRegularAuto());

    await GroupPermissionResource.grantMany(auth, {
      grants: bulkGrants,
      transaction,
    });

    for (const grant of autoGrants) {
      await GroupPermissionResource.grant(auth, { ...grant, transaction });
    }
  }

  async canAddMember(auth: Authenticator, userId: string): Promise<boolean> {
    // Only regular spaces and projects can have manual members.
    if (!this.isRegular() && !this.isProject()) {
      return false;
    }

    // Can only add members in manual management mode.
    if (this.managementMode !== "manual") {
      return false;
    }

    // Assert the space still has exactly one manual member group (invariant preserved from the
    // former GroupSpaceMemberResource path).
    await this.fetchManualMemberGroup(auth);

    // Users can add themselves to open projects; otherwise managing a space's members requires
    // administration rights (held by workspace admins and a project's editors) — a project's plain
    // members hold `write` but must not be able to add others, so this gates on `admin`.
    if (this.isProject() && !(await this.isRestricted(auth))) {
      const currentUser = auth.getNonNullableUser();
      if (userId === currentUser.sId) {
        return true;
      }
    }

    return auth.can("admin", this);
  }

  isGlobal() {
    return this.kind === "global";
  }

  isSystem() {
    return this.kind === "system";
  }

  // This is a bit confusing (but temporary) because the "conversations" kind is a special kind of space to hold all conversations files (legacy).
  // It's different from a space that support having conversations.
  isConversations() {
    return this.kind === "conversations";
  }

  isRegular() {
    return this.kind === "regular";
  }

  isProject() {
    return this.kind === "project";
  }

  // A regular space or project is restricted when it is member-only: the workspace global group
  // holds no `reader` grant on it (an open space grants that group a `reader` grant, which is what
  // makes it visible to every workspace member). Global, conversations and system spaces are never
  // restricted. This is the resource-level equivalent of the serialized `EnrichedSpaceType.isRestricted`.
  // Resolved from `group_permissions`; serialize a batch of spaces via `batchToJSONEnriched` to avoid
  // one query per space.
  async isRestricted(auth: Authenticator): Promise<boolean> {
    if (!this.isRegular() && !this.isProject()) {
      return false;
    }

    const isOpen = (
      await SpaceResource.listOpenSpaceModelIds(auth, [this])
    ).has(this.id);

    return !isOpen;
  }

  // The model ids of the `spaces` that are open (the workspace global group holds a `reader` grant).
  // One `group_permissions` query (plus the global group lookup) for the whole batch.
  static async listOpenSpaceModelIds(
    auth: Authenticator,
    spaces: SpaceResource[]
  ): Promise<Set<ModelId>> {
    const openSpaceModelIds = new Set<ModelId>();
    if (spaces.length === 0) {
      return openSpaceModelIds;
    }

    const globalGroupModelId = await auth.getGlobalGroupModelId();
    if (globalGroupModelId === null) {
      return openSpaceModelIds;
    }

    const readerGrants = await GroupPermissionModel.findAll({
      attributes: ["resourceId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        resourceType: "space",
        resourceId: spaces.map((space) => space.id),
        groupId: globalGroupModelId,
        grantType: "reader",
      },
    });

    for (const grant of readerGrants) {
      openSpaceModelIds.add(grant.resourceId);
    }

    return openSpaceModelIds;
  }

  isDeletable() {
    return (
      // Soft-deleted spaces can be deleted.
      this.deletedAt !== null ||
      // Also, defaults spaces can be deleted.
      this.isGlobal() ||
      this.isSystem() ||
      this.isConversations()
    );
  }

  // Serialization.

  /**
   * Suspends all active members of the default group when switching to group management mode
   */
  private async suspendManualGroupMembers(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const groups = await this.fetchRegularAutoGroups(auth, transaction);

    for (const group of groups) {
      await group.suspendMembers(auth, { transaction });
    }
  }

  /**
   * Restores all suspended members of the default group when switching to manual management mode
   */
  private async restoreManualGroupMembers(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const groups = await this.fetchRegularAutoGroups(auth, transaction);

    for (const group of groups) {
      await group.restoreMembers(auth, { transaction });
    }
  }

  /**
   * Fetches group memberships for this space's regular and editor groups
   * @param auth - Authenticator for workspace context
   * @param shouldIncludeAllMembers - If true, includes all members (active and revoked); if false, only active members
   * @returns Object containing the groups to process and their memberships
   */
  async fetchManualGroupsMemberships(
    auth: Authenticator,
    {
      shouldIncludeAllMembers = false,
    }: {
      shouldIncludeAllMembers?: boolean;
    } = {}
  ): Promise<{
    groupsToProcess: GroupResource[];
    allGroupMemberships: GroupMembershipModel[];
    editorGroupModelId: ModelId | null;
  }> {
    const groupsToProcess = await this.fetchRegularAutoGroups(auth);
    const editorGroup = await this.fetchManualEditorGroup(auth);
    const editorGroupModelId = editorGroup?.id ?? null;

    // Fetch all group memberships to get the startAt date (will be the joinedAt date returned for each member)
    const allGroupMemberships = await GroupMembershipModel.findAll({
      where: {
        groupId: {
          [Op.in]: groupsToProcess.map((g) => g.id),
        },
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(shouldIncludeAllMembers
          ? {
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            }
          : {
              status: "active",
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            }),
      },
    });

    return {
      groupsToProcess,
      allGroupMemberships,
      editorGroupModelId,
    };
  }

  /**
   * Distinct active users across this space's manual regular + editor groups
   * ({@link SpaceResource.fetchManualGroupsMemberships} with active memberships only).
   * Same user set returned as `space.members` on GET /api/w/[wId]/spaces/[spaceId]
   * when `includeAllMembers` is not `"true"` (dedupe is by numeric user id, equivalent
   * to `uniqBy(..., "sId")` on serialized members).
   */
  async fetchDistinctActiveManualGroupMembers(
    auth: Authenticator
  ): Promise<UserResource[]> {
    const { groupsToProcess } = await this.fetchManualGroupsMemberships(auth, {
      shouldIncludeAllMembers: false,
    });

    const batches = await concurrentExecutor(
      groupsToProcess,
      async (group) => group.getActiveMembers(auth),
      { concurrency: 10 }
    );

    const byId = new Map<ModelId, UserResource>();
    for (const user of batches.flat()) {
      if (!byId.has(user.id)) {
        byId.set(user.id, user);
      }
    }
    return [...byId.values()];
  }

  /**
   * Batched variant of {@link SpaceResource.fetchDistinctActiveManualGroupMembers}
   * across many spaces. Fetches every group's active memberships in a single
   * query (and the referenced users in a single query), avoiding the N+1 that
   * calling the per-space method in a loop would incur. Returns a map from
   * space model id to its distinct active members.
   */
  static async fetchDistinctActiveManualGroupMembersBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[]
  ): Promise<Map<ModelId, UserResource[]>> {
    const result = new Map<ModelId, UserResource[]>();
    if (spaces.length === 0) {
      return result;
    }

    // Load every space's grant references once, then keep the regular_auto ones (a space's manual
    // member + editor groups). Grant type cannot identify them (an open regular space's member group
    // holds a `reader` grant like the global group), so kind is resolved from the fetched groups.
    const referencesBySpaceModelId =
      await SpaceResource.listGrantReferencesBySpaceModelId(spaces);

    const allGroupModelIds = new Set<ModelId>();
    for (const references of referencesBySpaceModelId.values()) {
      for (const reference of references) {
        allGroupModelIds.add(reference.groupId);
      }
    }
    const allGroups = await GroupResource.dangerouslyFetchByModelIds(auth, [
      ...allGroupModelIds,
    ]);
    const regularAutoGroups = allGroups.filter((group) =>
      group.isRegularAuto()
    );
    const regularAutoGroupModelIds = new Set(
      regularAutoGroups.map((group) => group.id)
    );

    // The regular_auto group ids per space.
    const manualGroupModelIdsBySpaceModelId = new Map<ModelId, ModelId[]>();
    for (const space of spaces) {
      manualGroupModelIdsBySpaceModelId.set(
        space.id,
        (referencesBySpaceModelId.get(space.id) ?? [])
          .map((reference) => reference.groupId)
          .filter((groupId) => regularAutoGroupModelIds.has(groupId))
      );
    }

    // Single query for the active memberships across every group.
    const userModelIdsByGroupModelId =
      await GroupResource.getActiveMembershipsForGroups(
        auth,
        regularAutoGroups
      );

    // Single query for all the users referenced by those memberships.
    const allUserModelIds = new Set<ModelId>();
    for (const userModelIds of Object.values(userModelIdsByGroupModelId)) {
      for (const userModelId of userModelIds) {
        allUserModelIds.add(userModelId);
      }
    }
    const users = await UserResource.fetchByModelIds([...allUserModelIds]);
    const usersByModelId = new Map(users.map((u) => [u.id, u]));

    // Reassemble the distinct member set for each space.
    for (const space of spaces) {
      const groupModelIds =
        manualGroupModelIdsBySpaceModelId.get(space.id) ?? [];
      const byId = new Map<ModelId, UserResource>();
      for (const groupModelId of groupModelIds) {
        for (const userModelId of userModelIdsByGroupModelId[groupModelId] ??
          []) {
          const user = usersByModelId.get(userModelId);
          if (user && !byId.has(user.id)) {
            byId.set(user.id, user);
          }
        }
      }
      result.set(space.id, [...byId.values()]);
    }

    return result;
  }

  toJSON(): SpaceType {
    return {
      createdAt: this.createdAt.getTime(),
      kind: this.kind,
      managementMode: this.managementMode,
      name: this.name,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
    };
  }

  // Serialize with the space's grant-derived fields (`groupIds` and `isRestricted`). Private: these
  // are not carried on `toJSON` (that would force the eager `group_permissions` include on every
  // space load), so callers go through the batched `batchToJSONEnriched` rather than pairing this
  // with the loader themselves.
  private toJSONEnriched({
    groupIds,
    isRestricted,
  }: SpaceGrantEnrichment): EnrichedSpaceType {
    return {
      ...this.toJSON(),
      groupIds,
      isRestricted,
    };
  }

  // Serialize each of `spaces` to `EnrichedSpaceType` (base fields + grant-derived `groupIds` and
  // `isRestricted`), loading the grants in a single `group_permissions` query. This keeps the whole
  // enrichment flow inside the resource: the public API, the space-management UI and poke go through
  // here instead of wiring the loader + per-space fallback at each call site. The result preserves
  // the order of `spaces`.
  static async batchToJSONEnriched(
    auth: Authenticator,
    spaces: SpaceResource[]
  ): Promise<EnrichedSpaceType[]> {
    const enrichmentBySpaceModelId =
      await this.listSpaceEnrichmentBySpaceModelId(auth, spaces);
    return spaces.map((space) =>
      space.toJSONEnriched(
        enrichmentBySpaceModelId.get(space.id) ?? EMPTY_SPACE_GRANT_ENRICHMENT
      )
    );
  }

  // The grant-derived enrichment (`groupIds` + `isRestricted`) for each of `spaces`, keyed by space
  // model id. One query against `group_permissions` (the source of truth) so `batchToJSONEnriched`
  // can serialize each space. `groupIds` is every grant group (members, editors, provisioned, and
  // the open-space global reader); `isRestricted` mirrors `isRestricted()`.
  private static async listSpaceEnrichmentBySpaceModelId(
    auth: Authenticator,
    spaces: SpaceResource[]
  ): Promise<Map<ModelId, SpaceGrantEnrichment>> {
    const enrichmentBySpaceModelId = new Map<ModelId, SpaceGrantEnrichment>();
    if (spaces.length === 0) {
      return enrichmentBySpaceModelId;
    }

    const grants = await GroupPermissionModel.findAll({
      attributes: ["resourceId", "workspaceId", "groupId", "grantType"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        resourceType: "space",
        resourceId: spaces.map((space) => space.id),
      },
    });

    const groupIdsBySpaceModelId = new Map<ModelId, string[]>();
    const hasReaderGrantBySpaceModelId = new Map<ModelId, boolean>();
    for (const grant of grants) {
      const groupId = GroupResource.modelIdToSId({
        id: grant.groupId,
        workspaceId: grant.workspaceId,
      });
      const existing = groupIdsBySpaceModelId.get(grant.resourceId);
      if (existing) {
        existing.push(groupId);
      } else {
        groupIdsBySpaceModelId.set(grant.resourceId, [groupId]);
      }
      if (grant.grantType === "reader") {
        hasReaderGrantBySpaceModelId.set(grant.resourceId, true);
      }
    }

    for (const space of spaces) {
      // A reader (viewer) grant means the workspace global group is attached: the space is open.
      // Only regular and project spaces can be restricted (the unique kinds never are), matching
      // `isRestricted()`.
      const isOpen = hasReaderGrantBySpaceModelId.get(space.id) ?? false;
      enrichmentBySpaceModelId.set(space.id, {
        groupIds: groupIdsBySpaceModelId.get(space.id) ?? [],
        isRestricted: (space.isRegular() || space.isProject()) && !isOpen,
      });
    }

    return enrichmentBySpaceModelId;
  }
}
