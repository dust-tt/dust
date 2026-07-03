import type { Authenticator } from "@app/lib/auth";
import type { SkillDataSourceConfigurationModel } from "@app/lib/models/skill";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import type {
  SkillMCPServerConfiguration,
  SkillReferenceFields,
  SkillResourceConstructorOptions,
} from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import type { Attributes, ModelStatic } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillResourceBase
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

/**
 * Base layer of the SkillResource inheritance chain: holds the resource state,
 * the constructor and the accessors shared by all the layers.
 *
 * The chain is a code-organization device: each layer owns one domain of the
 * skill logic and only the final `SkillResource` class is exported to the rest
 * of the codebase.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class SkillResourceBase extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly dataSourceConfigurations: SkillDataSourceConfigurationModel[];
  protected fileAttachments: FileResource[];
  readonly editorGroup: GroupResource | null = null;
  readonly version: number | null = null;

  protected readonly globalSId: string | null;
  // Only meaningful for global skills: whether their instructions may be
  // serialized to the front-end. Custom skills always expose their own.
  protected readonly exposeInstructions: boolean;

  protected _mcpServerConfigurations: SkillMCPServerConfiguration[];

  protected constructor(
    _: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      dataSourceConfigurations,
      exposeInstructions,
      fileAttachments,
      globalSId,
      mcpServerConfigurations,
      editorGroup,
      version,
    }: SkillResourceConstructorOptions
  ) {
    super(SkillConfigurationModel, blob);

    this.dataSourceConfigurations = dataSourceConfigurations;
    this.editorGroup = editorGroup ?? null;
    this.exposeInstructions = exposeInstructions ?? false;
    this.fileAttachments = fileAttachments ?? [];
    this.globalSId = globalSId ?? null;
    this._mcpServerConfigurations = mcpServerConfigurations;
    this.version = version ?? null;
  }

  get sId(): string {
    if (this.globalSId) {
      return this.globalSId;
    }

    return SkillResourceBase.modelIdToSId({
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

  get mcpServerViews(): MCPServerViewResource[] {
    return this._mcpServerConfigurations.map((config) => config.view);
  }

  getFileAttachments(): readonly FileResource[] {
    return this.fileAttachments;
  }

  get mcpServerConfigurations(): SkillMCPServerConfiguration[] {
    return this._mcpServerConfigurations;
  }

  get isSystemSkill(): boolean {
    if (!this.globalSId) {
      return false;
    }

    return SystemSkillsRegistry.isSystemSkill(this.sId);
  }

  get inheritsAgentConfigurationDataSources(): boolean {
    if (!this.globalSId) {
      return false;
    }

    return (
      GlobalSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.globalSId
      ) ||
      SystemSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.globalSId
      )
    );
  }

  /**
   * Returns the fields to identify this skill in related tables (e.g., AgentSkillModel).
   */
  protected get skillReference(): SkillReferenceFields {
    return this.globalSId
      ? { globalSkillId: this.globalSId }
      : { customSkillId: this.id };
  }

  canWrite(auth: Authenticator): boolean {
    // API keys with at least builder role can write to any skill.
    if (auth.isKey() && auth.isBuilder()) {
      return true;
    }

    if (!this.editorGroup) {
      return false;
    }

    return this.editorGroup.canWrite(auth);
  }

  toJSON(auth: Authenticator): SkillType {
    const requestedSpaceIds = this.requestedSpaceIds.map((spaceId) =>
      SpaceResource.modelIdToSId({
        id: spaceId,
        workspaceId: this.workspaceId,
      })
    );

    // Code-defined (global) skills hide their instructions from the front-end by
    // default; a skill opts in via `exposeInstructions` in its definition (e.g.
    // docs/pptx/xlsx) so builders can read and build on top of it. System skills
    // and the rest stay opaque. Custom skills always expose their own
    // instructions. The list endpoints strip instructions/tools regardless, and
    // the public v1 API only returns custom skills, so this only surfaces on the
    // single-skill detail fetch.
    const hideInstructions =
      this.globalSId !== null && !this.exposeInstructions;

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.globalSId ? null : this.createdAt.getTime(),
      updatedAt: this.globalSId ? null : this.updatedAt.getTime(),
      editedBy: this.globalSId ? null : this.editedBy,
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      instructions: hideInstructions ? null : this.instructions,
      instructionsHtml: hideInstructions ? null : this.instructionsHtml,
      requestedSpaceIds,
      icon: this.icon ?? null,
      reinforcement: this.reinforcement,
      lastReinforcementAnalysisAt:
        this.lastReinforcementAnalysisAt?.toISOString() ?? null,
      selfImprovementLock: this.selfImprovementLock,
      selfImprovementCostsCapMicroUsd: this.selfImprovementCostsCapMicroUsd,
      selfImprovementCostsCapAwuCredits: this.selfImprovementCostsCapAwuCredits,
      source: this.source,
      sourceMetadata: this.sourceMetadata,
      tools: this.mcpServerViews.map((view) => {
        const serializedView = view.toJSON();
        const server = serializedView.server;
        return {
          ...serializedView,
          server: {
            ...server,
            // This object may be used in server side props so we need to make it serializable.
            // TODO(mcp 2025-12-24): make MCPServerType serverSideProps-serializable (no undefined).
            developerSecretSelection: server.developerSecretSelection ?? null,
            developerSecretSelectionDescription:
              server.developerSecretSelectionDescription ?? null,
            sharedSecret: server.sharedSecret ?? null,
            customHeaders: server.customHeaders ?? null,
          },
        };
      }),
      fileAttachments: this.fileAttachments.map((file) => ({
        fileId: file.sId,
        fileName: file.fileName,
      })),
      canWrite: this.canWrite(auth),
      isDefault: this.isDefault,
    };
  }
}
