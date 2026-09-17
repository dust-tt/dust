import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SystemSkillId } from "@app/lib/resources/skill/code_defined/system_registry";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SKILL_ICON } from "@app/lib/skill";
import { serializeSkillTag } from "@app/lib/skills/format";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import { DEFAULT_SKILL_AVAILABILITY } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

type CreateSkillOverrides = Partial<{
  availability: SkillAvailability;
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
  instructionsHtml: string | null;
  status: SkillStatus;
  version: number;
  requestedSpaceIds: ModelId[];
  manuallyRequestedSpaceIds: ModelId[];
  addCurrentUserAsEditor: boolean;
  attachedKnowledge: SkillAttachedKnowledge[];
  mcpServerViews: MCPServerViewResource[];
}>;

export class SkillFactory {
  static async create(
    auth: Authenticator,
    overrides: CreateSkillOverrides = {}
  ): Promise<SkillResource> {
    const user = auth.user();
    assert(user, "User is required");

    const availability = overrides.availability ?? DEFAULT_SKILL_AVAILABILITY;

    if (!(await auth.hasWorkspacePermission("create", "skill"))) {
      await grantWorkspacePermission(auth.getNonNullableWorkspace(), user, {
        grantType: "create",
        resourceType: "skill",
      });
      await auth.refresh();
    }

    // Any availability beyond "editors" requires the publish capability; grant it so the factory
    // can set up any availability.
    if (
      availability !== "editors" &&
      !(await auth.hasWorkspacePermission("publish", "skill"))
    ) {
      await grantWorkspacePermission(auth.getNonNullableWorkspace(), user, {
        grantType: "publish",
        resourceType: "skill",
      });
      await auth.refresh();
    }

    // Auto-discoverable skills additionally require the make_discoverable capability when
    // admin governance is enabled; grant it so the factory can set up any availability.
    if (
      availability === "users_and_agents" &&
      !(await auth.hasWorkspacePermission("make_discoverable", "skill"))
    ) {
      await grantWorkspacePermission(auth.getNonNullableWorkspace(), user, {
        grantType: "make_discoverable",
        resourceType: "skill",
      });
      await auth.refresh();
    }

    const name = overrides.name ?? "Test Skill";
    const agentFacingDescription =
      overrides.agentFacingDescription ?? "Test skill agent facing description";
    const userFacingDescription =
      overrides.userFacingDescription ?? "Test skill user facing description";
    const instructions = overrides.instructions ?? "Test skill instructions";
    const status = overrides.status ?? "active";
    const editedBy = overrides.status === "suggested" ? null : user.id;
    const requestedSpaceIds = overrides.requestedSpaceIds ?? [];
    const manuallyRequestedSpaceIds = overrides.manuallyRequestedSpaceIds ?? [];
    const attachedKnowledge = overrides.attachedKnowledge ?? [];
    const mcpServerViews = overrides.mcpServerViews ?? [];

    const skill = await SkillResource.makeNew(
      auth,
      {
        editedBy,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        instructionsHtml: overrides.instructionsHtml,
        name,
        requestedSpaceIds,
        manuallyRequestedSpaceIds,
        status,
        icon: SKILL_ICON.name,
        availability,
      },
      {
        mcpServerViews,
        addCurrentUserAsEditor: overrides.addCurrentUserAsEditor,
        attachedKnowledge,
      }
    );

    await auth.refresh();

    return skill;
  }

  static serializeSkillReferenceTag(
    skill: Pick<SkillResource, "sId" | "icon" | "name">
  ): string {
    return serializeSkillTag({
      id: skill.sId,
      icon: skill.icon,
      name: skill.name,
    });
  }

  static async createWithNestedSkill(
    auth: Authenticator,
    {
      parentOverrides = {},
      childOverrides = {},
    }: {
      parentOverrides?: CreateSkillOverrides;
      childOverrides?: CreateSkillOverrides;
    } = {}
  ): Promise<{
    parentSkill: SkillResource;
    childSkill: SkillResource;
    skillReferenceTag: string;
  }> {
    const childSkill = await this.create(auth, childOverrides);
    const skillReferenceTag = this.serializeSkillReferenceTag(childSkill);
    const parentSkill = await this.create(auth, {
      ...parentOverrides,
      instructions: parentOverrides.instructions ?? `Use ${skillReferenceTag}.`,
    });

    return { parentSkill, childSkill, skillReferenceTag };
  }

  static async updateNestedSkillReferences(
    auth: Authenticator,
    {
      childSkills,
      instructions,
      parentSkill,
    }: {
      childSkills: SkillResource[];
      instructions?: string;
      parentSkill: SkillResource;
    }
  ): Promise<SkillResource> {
    const nestedSkillInstructions =
      instructions ??
      (childSkills.length > 0
        ? `Use ${childSkills
            .map((childSkill) => this.serializeSkillReferenceTag(childSkill))
            .join(", ")}.`
        : "No nested skill references.");

    await parentSkill.updateSkill(auth, {
      name: parentSkill.name,
      agentFacingDescription: parentSkill.agentFacingDescription,
      userFacingDescription: parentSkill.userFacingDescription,
      instructions: nestedSkillInstructions,
      instructionsHtml: parentSkill.instructionsHtml,
      icon: parentSkill.icon,
      mcpServerViews: parentSkill.mcpServerViews,
      attachedKnowledge: await parentSkill.getAttachedKnowledge(auth),
      manuallyRequestedSpaceIds: parentSkill.manuallyRequestedSpaceIds,
      requestedSpaceIds: parentSkill.requestedSpaceIds,
    });

    const updatedParentSkill = await SkillResource.fetchById(
      auth,
      parentSkill.sId
    );
    assert(updatedParentSkill, "Updated parent skill is required");

    return updatedParentSkill;
  }

  static async linkToAgent(
    auth: Authenticator,
    {
      skillId,
      agentConfigurationId,
    }: {
      skillId: ModelId;
      agentConfigurationId: ModelId;
    }
  ): Promise<AgentSkillModel> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkill = await AgentSkillModel.create({
      workspaceId: workspace.id,
      customSkillId: skillId,
      globalSkillId: null,
      agentConfigurationId,
    });

    return agentSkill;
  }

  static async linkGlobalSkillToAgent(
    auth: Authenticator,
    {
      globalSkillId,
      agentConfigurationId,
    }: {
      globalSkillId: GlobalSkillId | SystemSkillId;
      agentConfigurationId: ModelId;
    }
  ): Promise<AgentSkillModel> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkill = await AgentSkillModel.create({
      workspaceId: workspace.id,
      customSkillId: null,
      globalSkillId,
      agentConfigurationId,
    });

    return agentSkill;
  }

  static async linkSkillToSkill(
    auth: Authenticator,
    {
      parentSkillId,
      childSkillId,
    }: {
      parentSkillId: ModelId;
      childSkillId: ModelId;
    }
  ): Promise<SkillResource> {
    const parentSkill = await SkillResource.fetchByModelIdWithAuth(
      auth,
      parentSkillId
    );
    assert(parentSkill, "Parent skill is required");

    const childSkill = await SkillResource.fetchByModelIdWithAuth(
      auth,
      childSkillId
    );
    assert(childSkill, "Child skill is required");

    return this.updateNestedSkillReferences(auth, {
      parentSkill,
      childSkills: [childSkill],
    });
  }
}
