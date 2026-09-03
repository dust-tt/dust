import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { PodFileTab } from "@app/types/pod_file_tab";
import { normalizeTabsOrder, sortPodFileTabs } from "@app/types/pod_file_tab";
import type { PodMetadataType } from "@app/types/project_metadata";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { col, fn, literal, Op } from "sequelize";

export type ProjectMetadataBlob = Omit<
  CreationAttributes<ProjectMetadataModel>,
  "workspaceId" | "spaceId"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectMetadataResource
  extends ReadonlyAttributesType<ProjectMetadataModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectMetadataResource extends BaseResource<ProjectMetadataModel> {
  static model: typeof ProjectMetadataModel = ProjectMetadataModel;

  constructor(
    model: typeof ProjectMetadataModel,
    blob: Attributes<ProjectMetadataModel>,
    readonly spaceId: number
  ) {
    super(ProjectMetadataModel, blob);
  }

  static fromModel(
    model: ProjectMetadataModel,
    spaceId: number
  ): ProjectMetadataResource {
    return new ProjectMetadataResource(
      ProjectMetadataModel,
      model.get(),
      spaceId
    );
  }

  get defaultSkillIds(): string[] {
    return this.defaultSkillsIds ?? [];
  }

  get sId(): string {
    return ProjectMetadataResource.modelIdToSId({
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
    return makeSId("project_metadata", {
      id,
      workspaceId,
    });
  }

  static async fetchBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<ProjectMetadataResource | null> {
    if (!space.isProject()) {
      return null;
    }

    const resources = await this.fetchBySpaceModelIds(auth, [space.id]);
    return resources.length > 0 ? resources[0] : null;
  }

  // Fetches by space string identifiers, resolving them to model ids internally so callers
  // don't have to deal with the conversion. Unresolvable sIds are ignored.
  static async fetchBySpaceIds(
    auth: Authenticator,
    spaceIds: string[]
  ): Promise<ProjectMetadataResource[]> {
    const spaceModelIds = removeNulls(spaceIds.map(getResourceIdFromSId));
    if (spaceModelIds.length === 0) {
      return [];
    }

    return this.fetchBySpaceModelIds(auth, spaceModelIds);
  }

  static async fetchBySpaceModelIds(
    auth: Authenticator,
    spaceModelIds: number[]
  ): Promise<ProjectMetadataResource[]> {
    const models = await ProjectMetadataModel.findAll({
      where: {
        spaceId: spaceModelIds,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return models.map((model) =>
      ProjectMetadataResource.fromModel(model, model.spaceId)
    );
  }

  static async removeSkillFromAllDefaultSkills(
    auth: Authenticator,
    skillId: string,
    transaction?: Transaction
  ): Promise<void> {
    await ProjectMetadataModel.update(
      {
        defaultSkillsIds: fn(
          "nullif",
          fn("array_remove", col("defaultSkillsIds"), skillId),
          literal("'{}'")
        ),
      },
      {
        where: {
          defaultSkillsIds: { [Op.contains]: [skillId] },
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );
  }

  static async makeNew(
    auth: Authenticator,
    space: SpaceResource,
    blob: ProjectMetadataBlob,
    transaction?: Transaction
  ): Promise<ProjectMetadataResource> {
    const model = await ProjectMetadataModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
      },
      { transaction }
    );

    return ProjectMetadataResource.fromModel(model, space.id);
  }

  async archive(transaction?: Transaction) {
    await this.update({ archivedAt: new Date() }, transaction);
  }

  async unarchive(transaction?: Transaction) {
    await this.update({ archivedAt: null }, transaction);
  }

  async updateDescription(
    description: string | null,
    transaction?: Transaction
  ) {
    await this.update({ description }, transaction);
  }

  updateDescriptionAndPinnedFramePath(blob: {
    description?: string | null;
    pinnedFramePath?: string | null;
  }) {
    return this.update(blob);
  }

  async updateIsAdminControlled(
    isAdminControlled: boolean,
    transaction?: Transaction
  ) {
    await this.update({ isAdminControlled }, transaction);
  }

  async updatePinnedFramePath(
    pinnedFramePath: string | null,
    transaction?: Transaction
  ) {
    await this.update({ pinnedFramePath }, transaction);
  }

  async updateFileTabs(
    frameTabs: PodFileTab[],
    tabsOrder: string[],
    transaction?: Transaction
  ) {
    await this.update({ frameTabs, tabsOrder }, transaction);
  }

  async removeFramePath(
    framePath: string,
    transaction?: Transaction
  ): Promise<void> {
    const frameTabs = (this.frameTabs ?? []).filter(
      (tab) => tab.path !== framePath
    );
    const tabsOrder = normalizeTabsOrder(
      (this.tabsOrder ?? []).filter((entry) => entry !== framePath),
      frameTabs.map((tab) => tab.path)
    );

    await this.update(
      {
        pinnedFramePath:
          this.pinnedFramePath === framePath ? null : this.pinnedFramePath,
        frameTabs,
        tabsOrder,
      },
      transaction
    );
  }

  /** Point the pinned Frame and file tabs referencing `fromPath` at `toPath` after a move. */
  async renameFramePath(
    fromPath: string,
    toPath: string,
    transaction?: Transaction
  ): Promise<void> {
    const frameTabs = (this.frameTabs ?? []).map((tab) =>
      tab.path === fromPath ? { ...tab, path: toPath } : tab
    );
    const tabsOrder = (this.tabsOrder ?? []).map((entry) =>
      entry === fromPath ? toPath : entry
    );

    await this.update(
      {
        pinnedFramePath:
          this.pinnedFramePath === fromPath ? toPath : this.pinnedFramePath,
        frameTabs,
        tabsOrder,
      },
      transaction
    );
  }

  async updateDefaultAgentId(
    defaultAgentId: string | null,
    transaction?: Transaction
  ) {
    await this.update({ defaultAgentId }, transaction);
  }

  // Space/availability access is enforced by SkillResource.fetchByIds (baseFetch) both when the
  // caller resolves the skills passed here and on every subsequent read
  async setDefaultSkills(
    skills: SkillResource[],
    transaction?: Transaction
  ): Promise<void> {
    const defaultSkillsIds = [...new Map(skills.map((s) => [s.sId, s])).keys()];

    await this.update(
      {
        defaultSkillsIds: defaultSkillsIds.length > 0 ? defaultSkillsIds : null,
      },
      transaction
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await ProjectMetadataModel.destroy({
      where: {
        id: this.id,
        workspaceId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): PodMetadataType {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: SpaceResource.modelIdToSId({
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      description: this.description,
      archivedAt: this.archivedAt?.getTime() ?? null,
      // Automated task generation removed; keep fields hardcoded for API compat.
      todoGenerationEnabled: false,
      lastTodoAnalysisAt: null,
      pinnedFramePath: this.pinnedFramePath ?? null,
      frameTabs: sortPodFileTabs(this.frameTabs ?? []).map(
        ({ path, title, icon }) => ({ path, title, icon })
      ),
      tabsOrder: normalizeTabsOrder(
        this.tabsOrder ?? [],
        (this.frameTabs ?? []).map((tab) => tab.path)
      ),
      defaultAgentId: this.defaultAgentId ?? null,
      defaultSkillIds: this.defaultSkillIds,
      isAdminControlled: this.isAdminControlled,
    };
  }
}
