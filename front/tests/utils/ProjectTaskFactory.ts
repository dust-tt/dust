import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { WorkspaceType } from "@app/types/user";

export class ProjectTaskFactory {
  static async create(
    workspace: WorkspaceType,
    space: SpaceResource,
    params: {
      userId: number;
      text?: string;
    }
  ): Promise<ProjectTaskResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    return ProjectTaskResource.makeNew(auth, {
      spaceId: space.id,
      userId: params.userId,
      createdByType: "user",
      createdByUserId: params.userId,
      createdByAgentConfigurationId: null,
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
      text: params.text ?? "A test todo item.",
      status: "todo",
      doneAt: null,
      actorRationale: null,
      agentInstructions: null,
      agentSuggestionStatus: null,
      agentSuggestionReviewedAt: null,
      agentSuggestionReviewedByUserId: null,
    });
  }
}
