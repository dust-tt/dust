import { Authenticator } from "@app/lib/auth";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";

export class TagFactory {
  static async create(
    workspace: WorkspaceType,
    params: {
      name: string;
    }
  ) {
    const auth = await Authenticator.internalUserForWorkspace(workspace.sId);
    return TagResource.makeNew(auth, {
      name: params.name,
      kind: "standard",
    });
  }

  // Test-only: attach a tag directly to a specific agent configuration version row. Production code
  // tags agents through `AgentResource.bulkUpdate`/`updateConfiguration`, which creates a new version
  // (see `syncAgentTags`); tests that assert per-version tag isolation need the raw association.
  static async addToAgent(
    auth: Authenticator,
    tag: TagResource,
    agentConfiguration: Pick<LightAgentConfigurationType, "id">
  ) {
    await TagAgentModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      tagId: tag.id,
      agentConfigurationId: agentConfiguration.id,
    });
  }
}
