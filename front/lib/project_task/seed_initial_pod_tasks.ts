import type { Authenticator } from "@app/lib/auth";
import {
  INITIAL_POD_TASKS,
  PROJECT_MANAGER_AGENT_SID,
} from "@app/lib/project_task/initial_project_tasks";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { PodTaskType } from "@app/types/project_task";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type SeedInitialPodTasksErrorCode =
  | "not_a_project"
  | "already_seeded"
  | "internal_error";

/**
 * Inserts starter tasks for the current user. No-ops when the space is not a
 * project.
 */
export async function seedInitialPodTasks(
  auth: Authenticator,
  space: SpaceResource
): Promise<
  Result<PodTaskType[], { code: SeedInitialPodTasksErrorCode; message: string }>
> {
  if (!space.isProject()) {
    return new Err({
      code: "not_a_project",
      message: "Tasks are only available for project spaces.",
    });
  }

  const assignee = auth.getNonNullableUser();
  const initialTexts = new Set(INITIAL_POD_TASKS.map((seed) => seed.text));
  const existingTasks = await ProjectTaskResource.fetchBySpace(auth, {
    spaceId: space.id,
    timeScope: "active",
    assigneeUserId: null,
  });
  if (existingTasks.some((task) => initialTexts.has(task.text))) {
    return new Err({
      code: "already_seeded",
      message: "Initial tasks have already been seeded for this project.",
    });
  }

  const created: ProjectTaskResource[] = [];
  try {
    // Insert in reverse array order so the first-defined task is saved last and sorts
    // to the top under default client ordering (`updatedAt` desc).
    for (const seed of INITIAL_POD_TASKS.slice().reverse()) {
      const task = await ProjectTaskResource.makeNew(auth, {
        spaceId: space.id,
        userId: assignee.id,
        createdByType: "agent",
        createdByUserId: null,
        createdByAgentConfigurationId: PROJECT_MANAGER_AGENT_SID,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        text: seed.text,
        agentInstructions: seed.agentInstructions,
        agentSuggestionStatus: "pending",
        status: "todo",
        doneAt: null,
        actorRationale: null,
      });
      created.push(task);
    }
  } catch (err) {
    logger.error(
      { err: normalizeError(err), spaceId: space.sId },
      "Failed to seed initial pod tasks"
    );
    return new Err({
      code: "internal_error",
      message: "Failed to seed initial pod tasks.",
    });
  }

  return new Ok(
    created.reverse().map((task) => ({
      ...task.toJSON(),
      conversationId: null,
      conversationSidebarStatus: null,
    }))
  );
}
