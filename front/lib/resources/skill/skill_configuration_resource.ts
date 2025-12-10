import type {
  Attributes,
  CreationAttributes,
  Model,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import {
  Err,
  formatUserFullName,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";
import type {
  SkillConfigurationType,
  SkillConfigurationWithAuthorType,
} from "@app/types/skill_configuration";

export type SkillConfigurationResourceWithAuthor =
  SkillConfigurationResource & {
    author: Attributes<UserModel>;
  };

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillConfigurationResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillConfigurationResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly author?: Attributes<UserModel>;
  readonly mcpServerConfigurations: Attributes<SkillMCPServerConfigurationModel>[];
  private readonly globalSId?: string;

  constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    options: {
      author?: Attributes<UserModel>;
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
      globalSId?: string;
    } = {}
  ) {
    super(SkillConfigurationModel, blob);

    this.author = options.author;
    this.mcpServerConfigurations = options.mcpServerConfigurations ?? [];
    this.globalSId = options.globalSId;
  }

  static async makeNew(
    blob: CreationAttributes<SkillConfigurationModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<SkillConfigurationResource> {
    const skillConfiguration = await this.model.create(blob, {
      transaction,
    });

    return new this(this.model, skillConfiguration.get());
  }

  private static async baseFetch<T extends Model, S extends string>(
    auth: Authenticator,
    options: SkillConfigurationFindOptions & {
      includes: [{ model: ModelStatic<T>; as: S; required: true }];
    }
  ): Promise<(SkillConfigurationResource & { [K in S]: Attributes<T> })[]>;
  private static async baseFetch(
    auth: Authenticator,
    options?: SkillConfigurationFindOptions
  ): Promise<SkillConfigurationResource[]>;
  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {}
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const { where, includes, onlyCustom, ...otherOptions } = options;

    const customSkillConfigurations = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: workspace.id,
      },
      include: includes,
    });

    const mcpServerConfigurations =
      customSkillConfigurations.length > 0
        ? await SkillMCPServerConfigurationModel.findAll({
            where: {
              workspaceId: workspace.id,
              skillConfigurationId: {
                [Op.in]: customSkillConfigurations.map((c) => c.id),
              },
            },
          })
        : [];

    const mcpServerConfigsBySkillId = new Map<
      number,
      Attributes<SkillMCPServerConfigurationModel>[]
    >();
    for (const config of mcpServerConfigurations) {
      const existing = mcpServerConfigsBySkillId.get(
        config.skillConfigurationId
      );
      if (existing) {
        existing.push(config.get());
      } else {
        mcpServerConfigsBySkillId.set(config.skillConfigurationId, [
          config.get(),
        ]);
      }
    }

    const customSkillConfigurationsRes = customSkillConfigurations.map(
      (c) =>
        new this(this.model, c.get(), {
          author: c.author?.get(),
          mcpServerConfigurations: mcpServerConfigsBySkillId.get(c.id) ?? [],
        })
    );

    // Only include global skills if onlyCustom is not true.
    if (onlyCustom === true) {
      return customSkillConfigurationsRes;
    }

    const globalSkillConfigurations: SkillConfigurationResource[] =
      GlobalSkillsRegistry.findAll(where).map((def) =>
        this.fromGlobalSkill(auth, def)
      );

    return [...customSkillConfigurationsRes, ...globalSkillConfigurations];
  }

  static async fetchWithAuthor(
    auth: Authenticator
  ): Promise<SkillConfigurationResourceWithAuthor[]> {
    return this.baseFetch(auth, {
      includes: [{ model: UserModel, as: "author", required: true }],
    });
  }

  private static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<SkillConfigurationResource | null> {
    const resources = await this.baseFetch(auth, {
      where: {
        id,
      },
      limit: 1,
      onlyCustom: true,
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchBySId(
    auth: Authenticator,
    sId: string
  ): Promise<SkillConfigurationResource | null> {
    // Try global first.
    const globalSkill = GlobalSkillsRegistry.getById(sId);
    if (globalSkill) {
      return this.fromGlobalSkill(auth, globalSkill);
    }

    // Try as custom skill sId.
    if (!isResourceSId("skill", sId)) {
      return null;
    }

    const resourceId = getResourceIdFromSId(sId);
    if (resourceId === null) {
      return null;
    }

    return this.fetchByModelIdWithAuth(auth, resourceId);
  }

  static async fetchByAgentConfigurationId(
    auth: Authenticator,
    agentConfigurationId: ModelId
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: SkillConfigurationModel,
          as: "customSkill",
          required: false,
        },
      ],
    });

    const skillConfigurations = removeNulls(
      agentSkills.map((sc) => {
        if (sc.customSkill) {
          return new this(this.model, sc.customSkill.get());
        } else if (sc.globalSkillId) {
          const globalSkill = GlobalSkillsRegistry.getById(sc.globalSkillId);
          if (globalSkill) {
            return this.fromGlobalSkill(auth, globalSkill);
          }
        }
      })
    );

    return skillConfigurations;
  }

  static async fetchActiveByName(
    auth: Authenticator,
    name: string
  ): Promise<SkillConfigurationResource | null> {
    const resources = await this.baseFetch(auth, {
      where: {
        name,
        status: "active",
      },
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchAllAvailableSkills(
    auth: Authenticator,
    limit?: number
  ): Promise<SkillConfigurationResource[]> {
    return this.baseFetch(auth, {
      where: {
        status: "active",
      },
      ...(limit ? { limit } : {}),
    });
  }

  get sId(): string {
    if (this.globalSId) {
      return this.globalSId;
    }

    return SkillConfigurationResource.modelIdToSId({
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
    return makeSId("skill", {
      id,
      workspaceId,
    });
  }

  private get isGlobal(): boolean {
    return this.globalSId !== undefined;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    if (this.isGlobal) {
      return new Err(new Error("Cannot delete a global skill configuration."));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();

      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async update(
    blob: Partial<Attributes<SkillConfigurationModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    if (this.isGlobal) {
      throw new Error("Cannot update a global skill configuration.");
    }

    return super.update(blob, transaction);
  }

  /**
   * Factory: Create from global skill definition.
   */
  private static fromGlobalSkill(
    auth: Authenticator,
    def: GlobalSkillDefinition
  ): SkillConfigurationResource {
    return new SkillConfigurationResource(
      this.model,
      {
        authorId: -1,
        createdAt: new Date(),
        description: def.description,
        // We fake the id here. We should rely exclusively on sId for global skills.
        id: -1,
        instructions: def.instructions,
        name: def.name,
        requestedSpaceIds: [],
        status: "active",
        updatedAt: new Date(),
        version: def.version,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { globalSId: def.sId }
    );
  }

  toJSON(
    this: SkillConfigurationResourceWithAuthor
  ): SkillConfigurationWithAuthorType;
  toJSON(this: SkillConfigurationResource): SkillConfigurationType;
  toJSON(): SkillConfigurationType | SkillConfigurationWithAuthorType {
    const tools = this.mcpServerConfigurations.map((config) => ({
      mcpServerViewId: makeSId("mcp_server_view", {
        id: config.mcpServerViewId,
        workspaceId: this.workspaceId,
      }),
    }));
    if (this.author) {
      return {
        sId: this.sId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        version: this.version,
        status: this.status,
        name: this.name,
        description: this.description,
        instructions: this.instructions,
        requestedSpaceIds: this.requestedSpaceIds,
        tools,
        author: {
          id: this.author.id,
          sId: this.author.sId,
          createdAt: this.author.createdAt.getTime(),
          username: this.author.username,
          fullName: formatUserFullName(this.author),
          email: this.author.email,
          firstName: this.author.firstName,
          lastName: this.author.lastName,
          image: this.author.imageUrl,
        },
      };
    }

    return {
      sId: this.sId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
      status: this.status,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      requestedSpaceIds: this.requestedSpaceIds,
      tools,
    };
  }
}
