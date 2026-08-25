import { isDatabaseFileSystemPodName } from "@app/lib/api/file_system/storage_mode";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConcreteGrantType } from "@app/lib/resources/group_permission_registry";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_viewer_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
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
import type { GrantType, GrantVerb } from "@app/types/group_permissions";
import { SPACE_EDITOR_GRANT_TYPE } from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import {
  GLOBAL_SPACE_NAME,
  isManageableGroupKind,
  MANAGEABLE_GROUP_KINDS,
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
import type { SpaceKind, SpaceType } from "@app/types/space";
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
class SpaceGroupReference {
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpaceResource extends BaseResource<SpaceModel> {
  static model: ModelStaticSoftDeletable<SpaceModel> = SpaceModel;

  // Memoized manual editor group. A space's editor group identity is immutable, so it is resolved
  // from `group_permissions` at most once per instance. `undefined` = not yet resolved; `null` =
  // resolved to "no manual editor group" (non-project space, or provisioned mode).
  private cachedManualEditorGroup?: GroupResource | null;

  constructor(
    model: ModelStaticSoftDeletable<SpaceModel>,
    blob: Attributes<SpaceModel>,
    readonly groups: SpaceGroupReference[]
  ) {
    super(SpaceModel, blob);
  }

  static fromModel(space: SpaceModel) {
    // Groups come from the space's `group_permissions` grants (the `spaceGrants` include), not
    // `group_vaults`. Each grant is eager-loaded with its `group` so the reference carries the kind.
    return new SpaceResource(
      SpaceModel,
      space.get(),
      (space.spaceGrants ?? []).map(SpaceGroupReference.fromGrant)
    );
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

      // Dual-write the `group_vaults` association rows (kept in sync until the table is dropped).
      for (const memberGroup of members) {
        await GroupSpaceModel.create(
          {
            groupId: memberGroup.id,
            groupKind: memberGroup.kind,
            vaultId: space.id,
            workspaceId: space.workspaceId,
            kind: "member",
          },
          { transaction: t }
        );
      }
      if (editors.length > 0) {
        assert(
          blob.kind === "project",
          "Only projects can have editor groups."
        );
        for (const editorGroup of editors) {
          await GroupSpaceModel.create(
            {
              groupId: editorGroup.id,
              groupKind: editorGroup.kind,
              vaultId: space.id,
              workspaceId: space.workspaceId,
              kind: "project_editor",
            },
            { transaction: t }
          );
        }
      }

      const spaceResource = new this(SpaceModel, space.get(), []);

      // Write group_permissions directly from the created associations, so a space is never
      // persisted without its grants. `auth` only needs to be in the space's workspace: the write
      // itself authorizes nothing (see `writeGroupPermissions`); who may create a space is gated by
      // the callers (`makeDefaultsForWorkspace`, `createSpaceAndGroup`).
      await spaceResource.writeGroupPermissions(auth, {
        members,
        editors,
        transaction: t,
      });

      // Re-read the grants just written so `this.groups` reflects the space's actual grant set
      // (its source of truth). No `group` join needed: the reference only carries the grant type.
      const spaceGrants = await GroupPermissionModel.findAll({
        where: {
          workspaceId: space.workspaceId,
          resourceType: "space",
          resourceId: space.id,
        },
        transaction: t,
      });

      return new this(
        SpaceModel,
        space.get(),
        spaceGrants.map(SpaceGroupReference.fromGrant)
      );
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

  async fetchGroupResources(
    auth: Authenticator,
    {
      groupReferences = this.groups,
      transaction,
    }: {
      groupReferences?: SpaceGroupReference[];
      transaction?: Transaction;
    } = {}
  ): Promise<GroupResource[]> {
    if (groupReferences.length === 0) {
      return [];
    }

    const groups = await GroupResource.fetchByModelIds(
      auth,
      groupReferences.map((group) => group.groupId),
      { transaction }
    );
    const groupsById = new Map(groups.map((group) => [group.id, group]));

    return groupReferences.map((group) => {
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
      {
        as: "spaceGrants",
        model: GroupPermissionModel,
        // A where on an include implies required: true;
        // pass this required: false to keep the original behavior intact.
        required: false,
        // workspaceId + resourceType make the (workspaceId, resourceType, resourceId) index usable
        // for the join on resourceId; resourceType is also required for correctness since resourceId
        // is polymorphic.
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          resourceType: "space",
        },
      },
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

      return spaces;
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
      spaces: resultSpaces.filter((space) => space.canRead(auth)),
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

    return spaces.filter((s) => s.canRead(auth));
  }

  static async canAdministrateSystemSpace(auth: Authenticator) {
    const systemSpace = await this.fetchWorkspaceSystemSpace(auth);
    return systemSpace.canAdministrate(auth);
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
      include: [
        {
          as: "spaceGrants",
          model: GroupPermissionModel,
          required: false,
          // No workspaceId here (cross-workspace bypass); resourceType is still required since
          // resourceId is polymorphic. Space ids are globally unique, so the join stays correct.
          where: { resourceType: "space" },
        },
      ],
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

    await GroupSpaceModel.destroy({
      where: {
        vaultId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

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
        // As the model allows it, ensure the group is not associated with any other space.
        const count = await GroupSpaceModel.count({
          where: {
            groupId: group.id,
          },
          transaction,
        });
        if (count === 0) {
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
    if (!this.canAdministrate(auth)) {
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
      await regularGroup.updateName(
        auth,
        `${this.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${this.name}`
      );

      if (this.isProject()) {
        const spaceEditorGroup = await this.fetchManualEditorGroup(auth);
        if (spaceEditorGroup) {
          await spaceEditorGroup.updateName(
            auth,
            `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`
          );
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
    if (!this.canAdministrate(auth)) {
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

    const wasRestricted = !this.isOpen();

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;

    const result = await withTransaction(async (t) => {
      // Update managementMode if provided
      const { managementMode } = params;

      // The group set and editor classification are reconstructed from the `GroupSpace*Resource`
      // classes (see `fetchAssociatedGroups`), not read from `this.groups`: callers mutate the group
      // associations in-transaction, so re-read them before each write to reflect those mutations.
      const syncGroupPermissions = async () =>
        this.writeGroupPermissions(auth, {
          ...(await this.fetchAssociatedGroups(t)),
          transaction: t,
        });

      // If the space should be restricted and was not restricted before, remove the global group.
      if (!wasRestricted && isRestricted) {
        const globalGroupReference = this.groups.find(
          (group) => group.groupId === globalGroup.id
        );
        assert(
          globalGroupReference,
          "An unrestricted space must have a global group."
        );
        await this.removeGroup(auth, globalGroupReference, t);
      }

      // If the space should not be restricted and was restricted before, add the global group.
      if (wasRestricted && !isRestricted) {
        if (this.isProject()) {
          // Global group gets viewer permissions in projects
          await GroupSpaceViewerResource.makeNew(auth, {
            group: globalGroup,
            space: this,
            transaction: t,
          });
        } else {
          await GroupSpaceMemberResource.makeNew(auth, {
            group: globalGroup,
            space: this,
            transaction: t,
          });
        }
      }

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

        // Get the GroupSpaceMemberResource for the member group
        const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
          space: this,
          transaction: t,
          filterOnManagementMode: true,
        });

        assert(
          memberGroupSpaces.length === 1,
          "In manual management mode, there should be exactly one member group space."
        );

        const setMembersRes = await memberGroupSpaces[0].setMembers(auth, {
          users: users.map((u) => u.toJSON()),
          transaction: t,
        });
        if (setMembersRes.isErr()) {
          await syncGroupPermissions();
          return setMembersRes;
        }

        // Handle editor group - create if needed and update members
        if (this.isProject()) {
          let editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
            space: this,
            transaction: t,
            filterOnManagementMode: true,
          });

          if (!editorGroupSpaces.length) {
            // Create a new editor group
            const editorGroup = await GroupResource.makeNew(
              {
                name: `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`,
                kind: "regular_auto",
                workspaceId: this.workspaceId,
              },
              { transaction: t }
            );

            // Link the editor group to the space
            const editorGroupSpace = await GroupSpaceEditorResource.makeNew(
              auth,
              {
                group: editorGroup,
                space: this,
                transaction: t,
              }
            );
            editorGroupSpaces = [editorGroupSpace];
          }
          assert(
            editorGroupSpaces.length === 1,
            "In manual management mode, there should be exactly one editor group space."
          );

          // Set members of the editor group using the GroupSpaceEditorResource
          const editorUsers = await UserResource.fetchByIds(editorIds);
          assert(
            editorUsers.length > 0 || isAdminControlled,
            "Pods must have at least one editor."
          );
          const setEditorsRes = await editorGroupSpaces[0].setMembers(auth, {
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

        // Remove the associations of every group the user can pick here (provisioned and manual
        // alike), read straight from group_vaults rather than `this.groups` (now sourced from
        // group_permissions). Switching to manual mode drops those grants but leaves the
        // group_vaults rows, so `this.groups` would not list them and the re-insert below would hit
        // the (vaultId, groupId) unique constraint. Clearing the whole selectable set is also what
        // makes deselecting a group actually remove its access.
        await GroupSpaceModel.destroy({
          where: {
            vaultId: this.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            groupKind: { [Op.in]: [...MANAGEABLE_GROUP_KINDS] },
          },
          transaction: t,
        });

        // Add the new groups
        const selectedGroupsResult = await GroupResource.fetchByIds(
          auth,
          groupIds
        );
        if (selectedGroupsResult.isErr()) {
          // The provisioned groups just removed above stay removed, so their grants must be removed too.
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
          // The associations were already dropped above, so re-sync before bailing out.
          await syncGroupPermissions();
          return new Err(
            new DustError(
              "invalid_group_kind",
              "Only provisioned and manual groups can be given access to a space."
            )
          );
        }
        for (const selectedGroup of selectedGroups) {
          await GroupSpaceMemberResource.makeNew(auth, {
            group: selectedGroup,
            space: this,
            transaction: t,
          });
        }

        if (this.isProject()) {
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
          // Same as above: `GroupSpaceEditorResource.makeNew` asserts on the kind, which would be a
          // 500 rather than a rejected request.
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
          for (const selectedEditorGroup of selectedEditorGroups) {
            await GroupSpaceEditorResource.makeNew(auth, {
              group: selectedEditorGroup,
              space: this,
              transaction: t,
            });
          }
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
    // permission check in the same request (e.g. the post-update `canRead` in the members handler)
    // sees the new state instead of a pre-mutation view.
    await auth.refresh();

    return result;
  }

  private async removeGroup(
    auth: Authenticator,
    groupReference: SpaceGroupReference,
    transaction?: Transaction
  ) {
    await GroupSpaceModel.destroy({
      where: {
        groupId: groupReference.groupId,
        vaultId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
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
    if (!this.canAdministrate(auth)) {
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

    // Authorization is the space-level `canAdministrate` gate above; the member group is resolved
    // from group_permissions and mutated directly.
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
    if (!this.canAdministrate(auth)) {
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
    if (!this.canAdministrate(auth)) {
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
    if (!this.canAdministrate(auth)) {
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
  // editor group. Resolved from `group_permissions` (not `this.groups`, whose grant references
  // cannot tell a regular_auto group from the global group by grant type). Empty in group management
  // mode, where the space's groups are provisioned (IdP-owned) rather than auto-created.
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

  // The groups that make up this space's membership: its member group and, for projects, its editor
  // group (regular_auto in manual mode, provisioned in group mode). Groups holding only a read-only
  // (`reader`) grant are excluded — that is the workspace global group attached to an open space as
  // a viewer, which makes the space visible without making anyone a member. Use this to list who
  // actually belongs to the space.
  async fetchMembershipGroups(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource[]> {
    const groupReferences = this.groups.filter((group) => !group.isReader());
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
    // grants `spaceGroupRoles` writes mirror `isMemberByGroupPredicate` per kind (see the
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
   * Same membership rule as {@link SpaceResource.isMember}, evaluated against a
   * precomputed set of group model ids instead of an `Authenticator`. Lets
   * callers check many users at once without building one `Authenticator` per
   * user.
   */
  isMemberByGroupModelIds(groupModelIds: ReadonlySet<ModelId>): boolean {
    return this.isMemberByGroupPredicate((groupModelId) =>
      groupModelIds.has(groupModelId)
    );
  }

  private isMemberByGroupPredicate(
    hasGroup: (groupModelId: ModelId) => boolean
  ): boolean {
    // TODO(projects): update this method to check groups whose group_vaults relationship is
    // to remove the complexity of checking the global group based on the space type.

    const groups = this.groups;

    switch (this.kind) {
      case "regular":
        // An open regular space grants membership to every workspace member.
        return this.isOpen() || groups.some((group) => hasGroup(group.groupId));
      case "project":
        // The global group is attached to open projects as a public viewer (a reader grant), which
        // makes the project visible but does not make you a member; membership comes from the other
        // groups.
        return groups.some(
          (group) => !group.isReader() && hasGroup(group.groupId)
        );
      case "global":
        return true;
      case "conversations":
      case "system":
        return false;

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

    // Global Workspace space and Conversations space.
    if (this.isGlobal() || this.isConversations()) {
      return [
        { role: "admin", permissions: ["admin", "read", "write"] },
        // TODO(governance): remove once manager is available for everyone
        { role: "builder", permissions: ["read", "write"] },
        { role: "manager", permissions: ["read", "write"] },
      ];
    }

    // Open space.
    if (this.isRegularAndOpen()) {
      return [
        { role: "admin", permissions: ["admin", "read", "write"] },
        // TODO(governance): remove once manager is available for everyone
        { role: "builder", permissions: ["read", "write"] },
        { role: "manager", permissions: ["read", "write"] },
        { role: "user", permissions: ["read"] },
      ];
    }

    if (this.isProject()) {
      return [
        { role: "admin", permissions: ["admin"] },
        { role: "manager", permissions: this.isOpen() ? ["read"] : [] }, // Non-restricted projects are visible to all users
        { role: "user", permissions: this.isOpen() ? ["read"] : [] }, // Non-restricted projects are visible to all users
      ];
    }

    // Restricted regular space.
    return [{ role: "admin", permissions: ["admin"] }];
  }

  // The role each of this space's `group_vaults` associations confers, as a registry grant type.
  // This is the single mapping the governance model needs — space kind + group kind -> role — and
  // the only thing `group_permissions` stores (see `writeGroupPermissions`). Verbs are never stored:
  // they are `ROLE_REGISTRY.space`'s to expand when the table is read back.
  //
  // `associatedGroups` is the full set of groups attached to this space, and `editorGroupIds`
  // classifies which of a project's groups are editors. Both are passed in rather than read from
  // `this.groups`: that association is derived from `group_vaults` (being removed), and a provisioned
  // group can be an editor or a member so the group kind alone cannot tell them apart. Callers source
  // them from the `GroupSpace*Resource` classes (see `fetchAssociatedGroups`) or from the groups they
  // just created.
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

    // Provisioned groups do not carry grants on manually-managed spaces.
    const groups =
      this.managementMode === "manual"
        ? associatedGroups.filter((group) => !group.isProvisioned())
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

  // The groups attached to this space, split into `members` and `editors` (the same shape
  // `writeGroupPermissions` expects), reconstructed from the `GroupSpace*Resource` classes rather
  // than `this.groups` (which is derived from `group_vaults`, being removed). This is the single
  // place to re-point once `group_permissions` becomes the source of truth. The project viewer group
  // (the workspace global group) is returned in `members`, since only editors need to be told apart.
  async fetchAssociatedGroups(transaction?: Transaction): Promise<{
    members: GroupResource[];
    editors: GroupResource[];
  }> {
    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: this,
      transaction,
    });
    const members = memberGroupSpaces.map((groupSpace) => groupSpace.group);

    if (!this.isProject()) {
      return { members, editors: [] };
    }

    const editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
      space: this,
      transaction,
    });
    const viewerGroupSpace = await GroupSpaceViewerResource.fetchBySpace({
      space: this,
      transaction,
    });

    return {
      members: [
        ...members,
        ...(viewerGroupSpace ? [viewerGroupSpace.group] : []),
      ],
      editors: editorGroupSpaces.map((groupSpace) => groupSpace.group),
    };
  }

  // Writes this space's `group_permissions` rows from the roles its groups confer (see
  // `spaceGroupRoles`). The space mutation paths call this to keep the table in sync as the source of
  // truth. Idempotent — it clears the space's instance grants then re-inserts the desired set in one
  // transaction.
  //
  // The caller passes the space's groups split into `members` and `editors` (the workspace global
  // group, attached to unrestricted spaces, goes in `members`) rather than this method reading
  // `this.groups`: that association is derived from `group_vaults` (being removed), and callers mutate
  // it in-transaction so `this.groups` would be stale anyway. Callers that already hold the groups
  // pass them directly; others use `fetchAssociatedGroups`. `editors` only applies to projects.
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

    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: this,
      filterOnManagementMode: true,
    });

    assert(
      memberGroupSpaces.length === 1,
      "In manual management mode, there should be exactly one member group space."
    );

    return memberGroupSpaces[0].canAddMember(auth, userId);
  }

  canAdministrate(auth: Authenticator) {
    return this.hasSpacePermission(auth, "admin");
  }

  canWrite(auth: Authenticator) {
    return this.hasSpacePermission(auth, "write");
  }

  canRead(auth: Authenticator) {
    return this.hasSpacePermission(auth, "read");
  }

  // Serves the space permission decision from `group_permissions` (see `getAccessControlLists`).
  private hasSpacePermission(auth: Authenticator, verb: GrantVerb): boolean {
    return auth.hasPermission(verb, this);
  }

  canReadOrAdministrate(auth: Authenticator) {
    return this.canRead(auth) || this.canAdministrate(auth);
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

  isRegularAndRestricted() {
    return this.isRegular() && !this.isOpen();
  }

  isProjectAndRestricted() {
    return this.isProject() && !this.isOpen();
  }

  isRegularAndOpen() {
    return this.isRegular() && this.isOpen();
  }

  isOpen() {
    // A space is open when it has a reader (viewer) grant: the workspace global group is attached as
    // a viewer on open spaces (restricted spaces have no reader grant). See
    // `SpaceGroupReference.isReader`.
    return this.groups.some((group) => group.isReader());
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

    // Fetch every space grant's group once, then keep the regular_auto ones (a space's manual
    // member + editor groups). Grant type cannot identify them (an open regular space's member group
    // holds a `reader` grant like the global group), so kind is resolved from the fetched groups.
    const allGroupModelIds = new Set<ModelId>();
    for (const space of spaces) {
      for (const group of space.groups) {
        allGroupModelIds.add(group.groupId);
      }
    }
    const allGroups = await GroupResource.fetchByModelIds(auth, [
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
        space.groups
          .map((group) => group.groupId)
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
      groupIds: this.groups.map((group) => group.groupSId),
      isRestricted:
        this.isRegularAndRestricted() || this.isProjectAndRestricted(),

      kind: this.kind,
      managementMode: this.managementMode,
      name: this.name,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
