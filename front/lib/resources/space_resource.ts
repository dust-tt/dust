import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_viewer_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
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
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { GroupKind, GroupType } from "@app/types/groups";
import {
  GLOBAL_SPACE_NAME,
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";
import type {
  LegacyCombinedResourcePermissions,
  LegacyGroupPermission,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { GroupSpaceKind, SpaceKind, SpaceType } from "@app/types/space";
import assert from "assert";
import uniq from "lodash/uniq";
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
 * Lightweight representation of a group_vaults join row. It carries enough
 * data to enforce space permissions without fetching the full group and adding
 * a second join. This is slated to be superseded by the upcoming
 * GroupPermission model.
 */
class SpaceGroupReference {
  constructor(
    readonly groupId: ModelId,
    readonly groupKind: GroupKind,
    readonly groupSpaceKind: GroupSpaceKind,
    readonly workspaceId: ModelId
  ) {}

  static fromGroupSpaceModel(groupSpace: GroupSpaceModel) {
    return new SpaceGroupReference(
      groupSpace.groupId,
      groupSpace.groupKind,
      groupSpace.kind,
      groupSpace.workspaceId
    );
  }

  get groupSId(): string {
    return GroupResource.modelIdToSId({
      id: this.groupId,
      workspaceId: this.workspaceId,
    });
  }

  isGlobal(): boolean {
    return this.groupKind === "global";
  }

  isRegularAuto(): boolean {
    return this.groupKind === "regular_auto";
  }

  isProvisioned(): boolean {
    return this.groupKind === "provisioned";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpaceResource extends BaseResource<SpaceModel> {
  static model: ModelStaticSoftDeletable<SpaceModel> = SpaceModel;

  constructor(
    model: ModelStaticSoftDeletable<SpaceModel>,
    blob: Attributes<SpaceModel>,
    readonly groups: SpaceGroupReference[]
  ) {
    super(SpaceModel, blob);
  }

  static fromModel(space: SpaceModel) {
    return new SpaceResource(
      SpaceModel,
      space.get(),
      space.groupSpaces.map(SpaceGroupReference.fromGroupSpaceModel)
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
    blob: CreationAttributes<SpaceModel>,
    groups: { members: GroupResource[]; editors?: GroupResource[] },
    transaction?: Transaction
  ) {
    return withTransaction(async (t: Transaction) => {
      const space = await SpaceModel.create(blob, { transaction: t });
      const { members, editors = [] } = groups;
      const groupSpaces: GroupSpaceModel[] = [];

      for (const memberGroup of members) {
        groupSpaces.push(
          await GroupSpaceModel.create(
            {
              groupId: memberGroup.id,
              groupKind: memberGroup.kind,
              vaultId: space.id,
              workspaceId: space.workspaceId,
              kind: "member",
            },
            { transaction: t }
          )
        );
      }
      if (editors.length > 0) {
        assert(
          blob.kind === "project",
          "Only projects can have editor groups."
        );
        for (const editorGroup of editors) {
          groupSpaces.push(
            await GroupSpaceModel.create(
              {
                groupId: editorGroup.id,
                groupKind: editorGroup.kind,
                vaultId: space.id,
                workspaceId: space.workspaceId,
                kind: "project_editor",
              },
              { transaction: t }
            )
          );
        }
      }

      return new this(
        SpaceModel,
        space.get(),
        groupSpaces.map(SpaceGroupReference.fromGroupSpaceModel)
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
        as: "groupSpaces",
        model: GroupSpaceModel,
        // A where on an include implies required: true;
        // pass this required: false to keep the original behavior intact
        required: false,
        where: { workspaceId: auth.getNonNullableWorkspace().id },
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
    // Fast path, lookup to pods spaces, we lookup the vault ids of the pods spaces and fetch the spaces by model ids.
    const raw = await GroupSpaceModel.findAll({
      attributes: ["vaultId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        kind: { [Op.in]: ["member", "project_editor"] },
        groupId: { [Op.in]: auth.groupModelIds() },
      },
    });

    const podVaultIds = uniq(raw.map((v) => v.vaultId));

    // Then we fetch the spaces by model ids.
    const allSpaces = await this.baseFetch(auth, {
      where: {
        id: { [Op.in]: podVaultIds },
        kind: "project",
      },
    });

    // To be on the safe side.
    const filteredSpaces = allSpaces.filter((s) => s.isMember(auth));
    if (filteredSpaces.length !== allSpaces.length) {
      logger.error(
        {
          spaceNotMember: allSpaces
            .filter((s) => !s.isMember(auth))
            .map((s) => s.sId),
        },
        "The user is not a member of some pod spaces. Action: check how we get the podVaultIds"
      );
    }

    return filteredSpaces;
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
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: groups.map((g) => g.id),
      },
    });

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
          id: groupSpaces.map((v) => v.vaultId),
        },
      });
    } else {
      spaces = await this.baseFetch(auth, {
        where: {
          id: groupSpaces.map((v) => v.vaultId),
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
          as: "groupSpaces",
          model: GroupSpaceModel,
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
    // Provisioned groups are not tied to any space, we don't delete them.
    const groupReferencesToMaybeDelete = this.groups.filter(
      (group) => !group.isProvisioned()
    );
    const groupsToMaybeDelete = await this.fetchGroupResources(auth, {
      groupReferences: groupReferencesToMaybeDelete,
      transaction,
    });

    await GroupSpaceModel.destroy({
      where: {
        vaultId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
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
    const existingSpace = await SpaceResource.fetchByName(auth, trimmedName);
    if (existingSpace && existingSpace.id !== this.id) {
      return new Err(new Error("This space name is already used."));
    }

    await this.update({ name: trimmedName });
    if (this.isRegular() || this.isProject()) {
      // For regular spaces that only have a single group, update
      // the group's name too (see https://github.com/dust-tt/tasks/issues/1738)
      const regularGroupReference = this.getSpaceManualMemberGroupReference();
      const spaceEditorGroupReference =
        this.getSpaceManualEditorGroupReference();
      const [regularGroup, spaceEditorGroup] = await this.fetchGroupResources(
        auth,
        {
          groupReferences: [
            regularGroupReference,
            ...(spaceEditorGroupReference && this.isProject()
              ? [spaceEditorGroupReference]
              : []),
          ],
        }
      );
      await regularGroup.updateName(
        auth,
        `${this.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${this.name}`
      );

      if (spaceEditorGroup && this.isProject()) {
        await spaceEditorGroup.updateName(
          auth,
          `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`
        );
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

    return withTransaction(async (t) => {
      // Update managementMode if provided
      const { managementMode } = params;

      // If the space should be restricted and was not restricted before, remove the global group.
      if (!wasRestricted && isRestricted) {
        const globalGroupReference = this.groups.find((group) =>
          group.isGlobal()
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
                kind: "space_editors",
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
            return setEditorsRes;
          }
        }
      } else if (managementMode === "group") {
        // Handle group-based management
        const groupIds = params.groupIds;
        const editorGroupIds = params.editorGroupIds;

        // Remove existing external groups
        const existingExternalGroups = this.groups.filter(
          (g) => g.groupKind === "provisioned"
        );
        for (const group of existingExternalGroups) {
          await this.removeGroup(auth, group, t);
        }

        // Add the new groups
        const selectedGroupsResult = await GroupResource.fetchByIds(
          auth,
          groupIds
        );
        if (selectedGroupsResult.isErr()) {
          return selectedGroupsResult;
        }
        const selectedGroups = selectedGroupsResult.value;
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
            return editorGroupsResult;
          }
          const selectedEditorGroups = editorGroupsResult.value;
          assert(
            selectedEditorGroups.length > 0,
            "Pods must have at least one editor group."
          );
          for (const selectedEditorGroup of selectedEditorGroups) {
            await GroupSpaceEditorResource.makeNew(auth, {
              group: selectedEditorGroup,
              space: this,
              transaction: t,
            });
          }
        }
      }

      return new Ok(undefined);
    });
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

  private async fetchManualMemberGroupSpace(): Promise<GroupSpaceMemberResource> {
    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: this,
      filterOnManagementMode: true,
    });

    assert(
      memberGroupSpaces.length === 1,
      "In manual management mode, there should be exactly one member group space."
    );

    return memberGroupSpaces[0];
  }

  private async fetchManualEditorGroupSpace(): Promise<GroupSpaceEditorResource> {
    assert(this.isProject(), "Only projects can have editor groups.");

    const editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
      space: this,
      filterOnManagementMode: true,
    });

    assert(
      editorGroupSpaces.length === 1,
      "In manual management mode, there should be exactly one editor group space."
    );

    return editorGroupSpaces[0];
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
      const editorGroupSpace = await this.fetchManualEditorGroupSpace();
      const memberGroupSpace = await this.fetchManualMemberGroupSpace();
      const editorGroup = editorGroupSpace.group;
      const memberGroup = memberGroupSpace.group;

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

    const editorGroupSpace = await this.fetchManualEditorGroupSpace();
    return editorGroupSpace.group.getActiveMembers(auth);
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

    const memberGroupSpace = await this.fetchManualMemberGroupSpace();

    const addMemberRes = await memberGroupSpace.addMembers(auth, {
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

    const editorGroupSpace = await this.fetchManualEditorGroupSpace();
    const activeEditors = await editorGroupSpace.group.getActiveMembers(auth);
    const activeEditorIds = new Set(activeEditors.map((user) => user.sId));
    const usersToAdd = users.filter((user) => !activeEditorIds.has(user.sId));

    if (usersToAdd.length === 0) {
      return new Ok([]);
    }

    const memberGroupSpace = await this.fetchManualMemberGroupSpace();
    const activeMembers = await memberGroupSpace.group.getActiveMembers(auth);
    const activeMemberIds = new Set(activeMembers.map((user) => user.sId));
    const usersToRemoveFromMembers = usersToAdd.filter((user) =>
      activeMemberIds.has(user.sId)
    );

    if (usersToRemoveFromMembers.length > 0) {
      const removeMemberRes = await memberGroupSpace.removeMembers(auth, {
        users: usersToRemoveFromMembers.map((user) => user.toJSON()),
      });
      if (removeMemberRes.isErr()) {
        return removeMemberRes;
      }
    }

    const addEditorRes = await editorGroupSpace.addMembers(auth, {
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

    const editorGroupSpace = await this.fetchManualEditorGroupSpace();
    const activeEditors = await editorGroupSpace.group.getActiveMembers(auth);
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

    const removeEditorRes = await editorGroupSpace.removeMembers(auth, {
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

    const memberGroupSpace = await this.fetchManualMemberGroupSpace();

    const removeMemberRes = await memberGroupSpace.removeMembers(auth, {
      users: users.map((user) => user.toJSON()),
    });

    if (removeMemberRes.isErr()) {
      return removeMemberRes;
    }

    return new Ok(users);
  }

  private getSpaceManualMemberGroupReference(): SpaceGroupReference {
    const regularGroups = this.groups.filter((group) => group.isRegularAuto());
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the space, but found ${regularGroups.length}.`
    );
    return regularGroups[0];
  }

  private getSpaceManualEditorGroupReference(): SpaceGroupReference | null {
    const editorGroups = this.groups.filter(
      (group) => group.groupKind === "space_editors"
    );
    if (editorGroups.length === 0) {
      return null;
    }
    assert(
      editorGroups.length === 1,
      `Expected at most one space editors group for the space, but found ${editorGroups.length}.`
    );
    return editorGroups[0];
  }

  /**
   * Check if the auth is a member of this space.
   */

  isMember(auth: Authenticator): boolean {
    return this.isMemberByGroupPredicate((groupModelId) =>
      auth.hasGroupByModelId(groupModelId)
    );
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
    switch (this.kind) {
      case "regular":
        for (const group of this.groups) {
          // In regular spaces, having the global group means that you are a member.
          if (group.isGlobal()) {
            return true;
          }
          if (hasGroup(group.groupId)) {
            return true;
          }
        }
        return false;
      case "project":
        for (const group of this.groups) {
          // Ignore the global group for project spaces as it means that the group is public but not that you are a member.
          if (group.isGlobal()) {
            continue;
          }
          if (hasGroup(group.groupId)) {
            return true;
          }
        }
        return false;
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
   * @returns Array of ResourcePermission objects based on space type
   */
  requestedPermissions(): LegacyCombinedResourcePermissions[] {
    // System space.
    if (this.isSystem()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [{ role: "admin", permissions: ["admin", "write"] }],
          groups: this.groups.map((group) => ({
            id: group.groupId,
            permissions: ["read", "write"],
          })),
        },
      ];
    }

    // Global Workspace space and Conversations space.
    if (this.isGlobal() || this.isConversations()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            // TODO(governance): remove once manager is available for everyone
            { role: "builder", permissions: ["read", "write"] },
            { role: "manager", permissions: ["read", "write"] },
          ],
          groups: this.groups.map((group) => ({
            id: group.groupId,
            permissions: ["read"],
          })),
        },
      ];
    }

    const groupFilter =
      this.managementMode === "manual"
        ? (group: SpaceGroupReference) => !group.isProvisioned()
        : () => true;

    // Open space.
    // Currently only using global group for simplicity.
    // TODO(2024-10-25 flav): Refactor to store a list of ResourcePermission on conversations and
    // agent_configurations. This will allow proper handling of multiple groups instead of only
    // using the global group as a temporary solution.
    if (this.isRegularAndOpen()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            // TODO(governance): remove once manager is available for everyone
            { role: "builder", permissions: ["read", "write"] },
            { role: "manager", permissions: ["read", "write"] },
            { role: "user", permissions: ["read"] },
          ],
          groups: this.groups.reduce((acc, group) => {
            if (groupFilter(group)) {
              acc.push({
                id: group.groupId,
                permissions: ["read"],
              });
            }
            return acc;
          }, [] as LegacyGroupPermission[]),
        },
      ];
    }

    if (this.isProject()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin"] },
            { role: "manager", permissions: this.isOpen() ? ["read"] : [] }, // Non-restricted projects are visible to all users
            { role: "user", permissions: this.isOpen() ? ["read"] : [] }, // Non-restricted projects are visible to all users
          ],
          groups: this.groups.reduce((acc, group) => {
            if (groupFilter(group)) {
              if (group.groupSpaceKind === "project_editor") {
                acc.push({
                  id: group.groupId,
                  permissions: ["admin", "read", "write"],
                });
              } else {
                // Members get read permissions in restricted projects (the unrestricted case is handled by the roles above)
                acc.push({
                  id: group.groupId,
                  permissions: ["read", "write"],
                });
              }
            }
            return acc;
          }, [] as LegacyGroupPermission[]),
        },
      ];
    }

    // Restricted regular space.
    return [
      {
        workspaceId: this.workspaceId,
        roles: [{ role: "admin", permissions: ["admin"] }],
        groups: this.groups.reduce((acc, group) => {
          if (groupFilter(group)) {
            acc.push({
              id: group.groupId,
              permissions: ["read", "write"],
            });
          }
          return acc;
        }, [] as LegacyGroupPermission[]),
      },
    ];
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
    return auth.canAdministrate(this.requestedPermissions());
  }

  canWrite(auth: Authenticator) {
    return auth.canWrite(this.requestedPermissions());
  }

  canRead(auth: Authenticator) {
    return auth.canRead(this.requestedPermissions());
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
    return this.groups.some((group) => group.isGlobal());
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
    const memberGroupReference = this.getSpaceManualMemberGroupReference();
    const editorGroupReference = this.getSpaceManualEditorGroupReference();
    const groups = await this.fetchGroupResources(auth, {
      groupReferences: [
        memberGroupReference,
        ...(editorGroupReference ? [editorGroupReference] : []),
      ],
      transaction,
    });

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
    const memberGroupReference = this.getSpaceManualMemberGroupReference();
    const editorGroupReference = this.getSpaceManualEditorGroupReference();
    const groups = await this.fetchGroupResources(auth, {
      groupReferences: [
        memberGroupReference,
        ...(editorGroupReference ? [editorGroupReference] : []),
      ],
      transaction,
    });

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
  }> {
    const groupReferences = this.groups.filter(
      (group) => group.isRegularAuto() || group.groupKind === "space_editors"
    );
    const groupsToProcess = await this.fetchGroupResources(auth, {
      groupReferences,
    });

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

    // Manual group references (regular + editor) per space.
    const manualGroupReferencesBySpaceModelId = new Map<
      ModelId,
      SpaceGroupReference[]
    >();
    const allGroupReferences = new Map<ModelId, SpaceGroupReference>();
    for (const space of spaces) {
      const groupReferences = space.groups.filter(
        (group) =>
          group.groupKind === "regular_auto" ||
          group.groupKind === "space_editors"
      );
      manualGroupReferencesBySpaceModelId.set(space.id, groupReferences);
      groupReferences.forEach((group) =>
        allGroupReferences.set(group.groupId, group)
      );
    }

    const allGroups = await GroupResource.fetchByModelIds(
      auth,
      [...allGroupReferences.values()].map((group) => group.groupId)
    );

    // Single query for the active memberships across every group.
    const userModelIdsByGroupModelId =
      await GroupResource.getActiveMembershipsForGroups(auth, allGroups);

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
      const groups = manualGroupReferencesBySpaceModelId.get(space.id) ?? [];
      const byId = new Map<ModelId, UserResource>();
      for (const group of groups) {
        for (const userModelId of userModelIdsByGroupModelId[group.groupId] ??
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
