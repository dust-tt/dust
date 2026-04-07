import { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectTodoCategory } from "@app/types/project_todo";
import type { WorkspaceType } from "@app/types/user";

export class ProjectTodoFactory {
  static async create(
    workspace: WorkspaceType,
    space: SpaceResource,
    params: {
      userId: number;
      category?: ProjectTodoCategory;
      text?: string;
    }
  ): Promise<ProjectTodoResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    return ProjectTodoResource.makeNew(auth, {
      spaceId: space.id,
      userId: params.userId,
      createdByType: "user",
      createdByUserId: params.userId,
      createdByAgentConfigurationId: null,
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
      category: params.category ?? "follow_ups",
      text: params.text ?? "A test todo item.",
      status: "todo",
      version: 1,
      doneAt: null,
      actorRationale: null,
    });
  }
}
