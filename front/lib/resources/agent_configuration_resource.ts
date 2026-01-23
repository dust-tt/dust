import assert from "assert";
import type { CreationAttributes, Transaction } from "sequelize";
import { col, fn, Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  AgentStatus,
  LightAgentConfigurationType,
  Result,
  UserType,
} from "@app/types";
import {
  Err,
  isAdmin,
  isBuilder,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  normalizeError,
  Ok,
} from "@app/types";
import type { TagType } from "@app/types/tag";

import { generateRandomModelSId } from "./string_ids";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentConfigurationResource
  extends ReadonlyAttributesType<AgentConfiguration> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentConfigurationResource extends BaseResource<AgentConfiguration> {
  static model: ModelStaticWorkspaceAware<AgentConfiguration> =
    AgentConfiguration;

  /**
   * Create a new agent configuration record.
   * Handles versioning, tag associations, and editor group management.
   */
  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<AgentConfiguration>,
      "workspaceId" | "sId"
    > & {
      tags?: TagType[];
      editors?: UserType[];
      sId?: string;
    },
    transaction?: Transaction
  ): Promise<Result<AgentConfigurationResource, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const performCreation = async (t: Transaction) => {
      let existingAgent: AgentConfiguration | null = null;
      let version = 0;

      // Handle version management and archiving for updates
      if (blob.sId) {
        existingAgent = await this.model.findOne({
          where: {
            sId: blob.sId,
            workspaceId: workspace.id,
          },
          attributes: ["scope", "version", "id", "sId"],
          order: [["version", "DESC"]],
          transaction: t,
          limit: 1,
        });

        if (existingAgent) {
          // Bump the version of the agent
          version = existingAgent.version + 1;
        }

        // Archive all previous versions
        await AgentConfiguration.update(
          { status: "archived" },
          {
            where: {
              sId: blob.sId,
              workspaceId: workspace.id,
            },
            transaction: t,
          }
        );
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const sId = blob.sId || generateRandomModelSId();
      const maxStepsPerRun = blob.maxStepsPerRun ?? MAX_STEPS_USE_PER_RUN_LIMIT;
      const agentConfigurationInstance = await this.model.create(
        {
          ...blob,
          sId,
          version,
          maxStepsPerRun,
          workspaceId: workspace.id,
          authorId: user.id,
        },
        {
          transaction: t,
        }
      );

      // Handle tag associations for active agents
      if (blob.status === "active" && blob.tags && blob.tags.length > 0) {
        const existingTags = existingAgent
          ? await TagResource.listForAgent(auth, existingAgent.id)
          : [];
        const existingReservedTags = existingTags
          .filter((tag) => tag.kind === "protected")
          .map((tag) => tag.sId);

        // Validate that non-builders cannot remove protected tags
        if (
          !isBuilder(workspace) &&
          !existingReservedTags.every((reservedTagId) =>
            blob.tags!.some((tag) => tag.sId === reservedTagId)
          )
        ) {
          throw new Error("Cannot remove reserved tag from agent");
        }

        // Create tag associations
        for (const tag of blob.tags) {
          const tagResource = await TagResource.fetchById(auth, tag.sId);
          if (tagResource) {
            // Validate that non-builders cannot add new protected tags
            if (
              !isBuilder(workspace) &&
              tagResource.kind === "protected" &&
              !existingReservedTags.includes(tagResource.sId)
            ) {
              throw new Error("Cannot add reserved tag to agent");
            }
            await TagAgentModel.create(
              {
                workspaceId: workspace.id,
                tagId: tagResource.id,
                agentConfigurationId: agentConfigurationInstance.id,
              },
              { transaction: t }
            );
          }
        }
      }

      // Handle editor group management for active agents
      if (blob.status === "active" && blob.editors) {
        // Assert that current user is in editors or is admin
        assert(
          blob.editors.some((e) => e.sId === user.sId) || isAdmin(workspace),
          "Unexpected: current user must be in editor group or admin"
        );

        if (!existingAgent) {
          // Create new editor group
          const group = await GroupResource.makeNewAgentEditorsGroup(
            auth,
            agentConfigurationInstance,
            { transaction: t }
          );
          await auth.refresh({ transaction: t });
          await group.setMembers(auth, blob.editors, { transaction: t });
        } else {
          // Associate existing group with new version
          const group = await GroupResource.fetchByAgentConfiguration({
            auth,
            agentConfiguration: existingAgent,
          });
          if (!group) {
            throw new Error(
              "Unexpected: agent should have exactly one editor group."
            );
          }
          const result = await group.addGroupToAgentConfiguration({
            auth,
            agentConfiguration: agentConfigurationInstance,
            transaction: t,
          });
          if (result.isErr()) {
            logger.error(
              {
                workspaceId: workspace.sId,
                agentConfigurationId: existingAgent.sId,
              },
              `Error adding group to agent ${existingAgent.sId}: ${result.error}`
            );
            throw result.error;
          }
          const setMembersRes = await group.setMembers(auth, blob.editors, {
            transaction: t,
          });
          if (setMembersRes.isErr()) {
            logger.error(
              {
                workspaceId: workspace.sId,
                agentConfigurationId: existingAgent.sId,
              },
              `Error setting members to agent ${existingAgent.sId}: ${setMembersRes.error}`
            );
            throw setMembersRes.error;
          }
        }
      }

      return agentConfigurationInstance;
    };

    try {
      const agentConfiguration = await withTransaction(
        performCreation,
        transaction
      );

      return new Ok(
        new AgentConfigurationResource(this.model, agentConfiguration.get())
      );
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Fetch an agent by sId and optional version.
   * Defaults to fetching the latest version.
   */
  static async fetchById(
    auth: Authenticator,
    sId: string,
    version?: number | "latest"
  ): Promise<AgentConfigurationResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const versionToFetch = version ?? "latest";

    let agentConfiguration: AgentConfiguration | null = null;

    if (versionToFetch === "latest") {
      // Fetch the latest version
      agentConfiguration = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          sId,
        },
        order: [["version", "DESC"]],
      });
    } else {
      // Fetch specific version
      agentConfiguration = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          sId,
          version: versionToFetch,
        },
      });
    }

    if (!agentConfiguration) {
      return null;
    }

    // Filter by space permissions
    const filtered = await this.filterBySpacePermissions(auth, [
      agentConfiguration,
    ]);

    if (filtered.length === 0) {
      return null;
    }

    return new AgentConfigurationResource(this.model, filtered[0].get());
  }

  /**
   * Fetch an agent by exact name match.
   */
  static async fetchByName(
    auth: Authenticator,
    name: string,
    version?: number | "latest",
    status?: AgentStatus
  ): Promise<AgentConfigurationResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const versionToFetch = version ?? "latest";

    let agentConfiguration: AgentConfiguration | null = null;

    if (versionToFetch === "latest") {
      // Fetch the latest version
      agentConfiguration = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          name,
          ...(status ? { status } : {}),
        },
        order: [["version", "DESC"]],
      });
    } else {
      // Fetch specific version
      agentConfiguration = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          name,
          version: versionToFetch,
          ...(status ? { status } : {}),
        },
      });
    }

    if (!agentConfiguration) {
      return null;
    }

    // Filter by space permissions
    const filtered = await this.filterBySpacePermissions(auth, [
      agentConfiguration,
    ]);

    if (filtered.length === 0) {
      return null;
    }

    return new AgentConfigurationResource(this.model, filtered[0].get());
  }

  /**
   * Fetch latest versions of multiple agents by sIds.
   */
  static async listByIds(
    auth: Authenticator,
    sIds: string[],
    version?: "latest" | "all",
    status?: AgentStatus,
    scope?: AgentConfiguration["scope"]
  ): Promise<AgentConfigurationResource[]> {
    if (sIds.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();
    const versionToFetch = version ?? "latest";

    let agentConfigurations: AgentConfiguration[];

    if (versionToFetch === "latest") {
      // Fetch latest versions only
      // First, get the maximum version for each sId
      const latestVersions = (await this.model.findAll({
        attributes: ["sId", [fn("MAX", col("version")), "max_version"]],
        where: {
          workspaceId: workspace.id,
          sId: { [Op.in]: sIds },
          ...(status ? { status } : {}),
          ...(scope ? { scope } : {}),
        },
        group: ["sId"],
        raw: true,
      })) as unknown as { sId: string; max_version: number }[];

      if (latestVersions.length === 0) {
        return [];
      }

      // Then fetch the actual records
      agentConfigurations = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          [Op.or]: latestVersions.map((v) => ({
            sId: v.sId,
            version: v.max_version,
          })),
        },
        order: [["version", "DESC"]],
      });
    } else {
      // Fetch all versions
      agentConfigurations = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          sId: { [Op.in]: sIds },
          ...(status ? { status } : {}),
          ...(scope ? { scope } : {}),
        },
        order: [
          ["sId", "ASC"],
          ["version", "DESC"],
        ],
      });
    }

    // Filter by space permissions
    const filtered = await this.filterBySpacePermissions(
      auth,
      agentConfigurations
    );

    return filtered.map(
      (agent) => new AgentConfigurationResource(this.model, agent.get())
    );
  }

  /**
   * Search agents by name pattern (case-insensitive).
   */
  static async searchByName(
    auth: Authenticator,
    namePattern: string,
    version?: "latest" | "all",
    status?: AgentStatus
  ): Promise<AgentConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const versionToFetch = version ?? "latest";

    if (versionToFetch === "latest") {
      // For latest only, we need to get distinct sIds first
      const allMatches = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          name: { [Op.iLike]: `%${namePattern}%` },
          ...(status ? { status } : {}),
        },
        order: [
          ["sId", "ASC"],
          ["version", "DESC"],
        ],
      });

      // Get unique sIds
      const uniqueSIds = Array.from(
        new Set(allMatches.map((agent) => agent.sId))
      );

      // Fetch latest versions for these sIds
      return this.listByIds(auth, uniqueSIds, "latest", status);
    } else {
      // Fetch all versions matching the pattern
      const agentConfigurations = await this.model.findAll({
        where: {
          workspaceId: workspace.id,
          name: { [Op.iLike]: `%${namePattern}%` },
          ...(status ? { status } : {}),
        },
        order: [
          ["sId", "ASC"],
          ["version", "DESC"],
        ],
      });

      // Filter by space permissions
      const filtered = await this.filterBySpacePermissions(
        auth,
        agentConfigurations
      );

      return filtered.map(
        (agent) => new AgentConfigurationResource(this.model, agent.get())
      );
    }
  }

  /**
   * Get favorite states for multiple agents for the current user.
   * Returns a map from sId to favorite boolean.
   */
  static async listAgentsFavoriteStateByIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<Map<string, boolean>> {
    if (sIds.length === 0) {
      return new Map();
    }

    const user = auth.user();
    if (!user) {
      return new Map();
    }

    const workspace = auth.getNonNullableWorkspace();

    const relations = await AgentUserRelation.findAll({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
        agentConfiguration: { [Op.in]: sIds },
      },
    });

    const favoriteMap = new Map<string, boolean>();

    // Initialize all sIds as not favorited
    for (const sId of sIds) {
      favoriteMap.set(sId, false);
    }

    // Set favorited ones
    for (const relation of relations) {
      if (relation.favorite) {
        favoriteMap.set(relation.agentConfiguration, true);
      }
    }

    return favoriteMap;
  }

  /**
   * List all agents favorited by a user.
   */
  static async listFavorites(
    auth: Authenticator,
    userId: number
  ): Promise<AgentConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const relations = await AgentUserRelation.findAll({
      where: {
        workspaceId: workspace.id,
        userId,
        favorite: true,
      },
    });

    if (relations.length === 0) {
      return [];
    }

    const sIds = relations.map((r) => r.agentConfiguration);

    return this.listByIds(auth, sIds, "latest");
  }

  /**
   * Update the agent's scope.
   */
  async updateScope(
    _auth: Authenticator,
    scope: Exclude<AgentConfiguration["scope"], "global">,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await withTransaction(async (t) => {
        await this.update({ scope }, t);
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Update the agent's requested space IDs.
   */
  async updateRequirements(
    _auth: Authenticator,
    newSpaceIds: number[],
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await withTransaction(async (t) => {
        await this.update({ requestedSpaceIds: newSpaceIds }, t);
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Archive all versions of this agent (soft delete).
   */
  async archive(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      await withTransaction(async (t) => {
        await AgentConfiguration.update(
          { status: "archived" },
          {
            where: {
              workspaceId: workspace.id,
              sId: this.sId,
            },
            transaction: t,
          }
        );
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Restore an archived agent (set status back to active).
   */
  async restore(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      await withTransaction(async (t) => {
        await AgentConfiguration.update(
          { status: "active" },
          {
            where: {
              workspaceId: workspace.id,
              sId: this.sId,
            },
            transaction: t,
          }
        );
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Set or update a user's favorite status for this agent.
   */
  async setFavorite(
    auth: Authenticator,
    favorite: boolean,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      const user = auth.getNonNullableUser();
      const workspace = auth.getNonNullableWorkspace();

      await withTransaction(async (t) => {
        await AgentUserRelation.upsert(
          {
            workspaceId: workspace.id,
            userId: user.id,
            agentConfiguration: this.sId,
            favorite,
          },
          { transaction: t }
        );
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Hard delete this agent and all related records (dangerous operation).
   * This will delete:
   * - The AgentConfiguration record
   * - All TagAgentModel records
   * - All GroupAgentModel records
   * - All AgentUserRelation records
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      await withTransaction(async (t) => {
        // Delete TagAgentModel records
        await TagAgentModel.destroy({
          where: {
            workspaceId: workspace.id,
            agentConfigurationId: this.id,
          },
          transaction: t,
        });

        // Delete GroupAgentModel records
        await GroupAgentModel.destroy({
          where: {
            workspaceId: workspace.id,
            agentConfigurationId: this.id,
          },
          transaction: t,
        });

        // Delete AgentUserRelation records (for this specific agent sId)
        await AgentUserRelation.destroy({
          where: {
            workspaceId: workspace.id,
            agentConfiguration: this.sId,
          },
          transaction: t,
        });

        // Delete the agent configuration itself
        await AgentConfiguration.destroy({
          where: {
            workspaceId: workspace.id,
            id: this.id,
          },
          transaction: t,
        });
      }, transaction);

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Filter agents by space permissions.
   * This implements the same logic as filterAgentsByRequestedSpaces.
   */
  private static async filterBySpacePermissions(
    auth: Authenticator,
    agents: AgentConfiguration[]
  ): Promise<AgentConfiguration[]> {
    if (agents.length === 0) {
      return [];
    }

    const uniqueSpaceIds = Array.from(
      new Set(agents.flatMap((agent) => agent.requestedSpaceIds))
    );

    // If no spaces are requested, all agents are accessible
    if (uniqueSpaceIds.length === 0) {
      return agents;
    }

    const spaces = await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds);
    const spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, spaces);

    // Filter out agents that reference missing/deleted spaces.
    // When a space is deleted, mcp actions are removed, and requestedSpaceIds are updated.
    const foundSpaceIds = new Set(spaces.map((s) => s.id));
    const validAgents = agents.filter((agent) =>
      agent.requestedSpaceIds.every((id) => foundSpaceIds.has(Number(id)))
    );

    const allowedBySpaceIds = validAgents.filter((agent) =>
      auth.canRead(
        createResourcePermissionsFromSpacesWithMap(
          spaceIdToGroupsMap,
          // Parse as Number since Sequelize array of BigInts are returned as strings.
          agent.requestedSpaceIds.map((id) => Number(id))
        )
      )
    );

    return allowedBySpaceIds;
  }

  /**
   * Convert the resource to a JSON representation.
   * Omits fields that require additional queries or auth context.
   */
  toJSON(): Omit<
    LightAgentConfigurationType,
    "userFavorite" | "tags" | "canRead" | "canEdit"
  > {
    return {
      id: this.id,
      sId: this.sId,
      versionCreatedAt: this.createdAt.toISOString(),
      version: this.version,
      versionAuthorId: this.authorId,
      scope: this.scope,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      model: {
        providerId: this.providerId,
        modelId: this.modelId,
        temperature: this.temperature,
        responseFormat: this.responseFormat,
      },
      pictureUrl: this.pictureUrl,
      status: this.status,
      maxStepsPerRun: this.maxStepsPerRun,
      templateId: this.templateId
        ? TemplateResource.modelIdToSId({ id: this.templateId })
        : null,
      requestedGroupIds: [],
      requestedSpaceIds: this.requestedSpaceIds.map((id) =>
        SpaceResource.modelIdToSId({ id, workspaceId: this.workspaceId })
      ),
    };
  }
}
