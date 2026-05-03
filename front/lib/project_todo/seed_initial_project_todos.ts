import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  INITIAL_PROJECT_TODOS,
  PROJECT_MANAGER_AGENT_SID,
} from "@app/lib/project_todo/initial_project_todos";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Inserts starter todos for the user who created the project. No-ops when the
 * space is not a project or the `project_todo` feature is off.
 */
export async function seedInitialProjectTodosForProjectCreator(
  auth: Authenticator,
  space: SpaceResource
): Promise<void> {
  if (!space.isProject()) {
    return;
  }
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("project_todo")) {
    return;
  }

  const creator = auth.getNonNullableUser();
  try {
    // Insert in reverse array order so the first-defined todo is saved last and sorts
    // to the top under default client ordering (`updatedAt` desc).
    for (const seed of INITIAL_PROJECT_TODOS.slice().reverse()) {
      await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: creator.id,
        createdByType: "agent",
        createdByUserId: null,
        createdByAgentConfigurationId: PROJECT_MANAGER_AGENT_SID,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        text: seed.text,
        agentInstructions: seed.agentInstructions,
        status: "todo",
        doneAt: null,
        actorRationale: null,
      });
    }
  } catch (err) {
    logger.error(
      { err: normalizeError(err), spaceId: space.sId },
      "Failed to seed initial project todos"
    );
  }
}
