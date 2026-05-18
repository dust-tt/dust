import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import type { AgentSuggestionStatus } from "@app/types/project_task";
import uniqBy from "lodash/uniqBy";

const BUTLER_AGENT_SID = "butler";

// Pool of todo texts to draw from randomly.
const TODO_POOL = [
  "Review the Q3 roadmap document and add comments",
  "Update the onboarding checklist for new hires",
  "Send weekly status report to stakeholders",
  "Fix broken link in the FAQ page",
  "Archive completed sprint tickets",
  "Draft the API migration guide",
  "Set up monitoring alerts for the new service",
  "Clean up unused feature flags",
  "Remove deprecated endpoint /v1/legacy",
  "Schedule a retrospective for the last sprint",
  "Write unit tests for the new authentication module",
  "Update the README with latest setup instructions",
  "Review open pull requests older than 7 days",
  "Audit user permissions in the staging environment",
  "Prepare the demo script for the upcoming client call",
  "Summarize last week's incident report",
  "Migrate remaining config values to environment variables",
  "Add error handling to the file upload endpoint",
  "Document the new data model changes",
  "Follow up with design on the updated mockups",
  "Triage the 10 oldest open bug reports",
  "Sync with legal on the updated privacy policy draft",
  "Profile and optimize the slowest database query",
  "Update dependencies to latest patch versions",
  "Create a runbook for the nightly batch job",
];

type SeedTodo = {
  text: string;
  isAgentSuggestion: boolean;
  agentSuggestionStatus: AgentSuggestionStatus | null;
  agentRationale?: string;
  status?: "todo" | "in_progress" | "done";
  agentMarkedDone?: boolean;
  deleted?: boolean;
};

function randomTodos(count: number): SeedTodo[] {
  return Array.from({ length: count }, () => {
    const text = TODO_POOL[Math.floor(Math.random() * TODO_POOL.length)];
    const isAgentSuggestion = Math.random() < 0.4;
    const roll = Math.random();

    if (roll < 0.15) {
      return {
        text,
        isAgentSuggestion,
        agentSuggestionStatus: isAgentSuggestion ? "rejected" : null,
        deleted: true,
      };
    } else if (roll < 0.5) {
      return {
        text,
        isAgentSuggestion,
        agentSuggestionStatus: isAgentSuggestion ? "approved" : null,
        status: "done" as const,
        agentMarkedDone: Math.random() < 0.5,
        agentRationale: isAgentSuggestion
          ? "Identified as a priority action based on recent project activity."
          : undefined,
      };
    } else {
      return {
        text,
        isAgentSuggestion,
        agentSuggestionStatus: isAgentSuggestion ? "pending" : null,
        status: "todo" as const,
      };
    }
  });
}

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string" as const,
      demandOption: true,
      description: "Workspace sId.",
    },
    spaceId: {
      alias: "pId",
      type: "string" as const,
      demandOption: true,
      description: "Project space sId.",
    },
    userId: {
      alias: "uId",
      type: "string" as const,
      demandOption: false,
      description:
        "User sId. If omitted, todos are distributed randomly across all project members.",
    },
    count: {
      alias: "n",
      type: "number" as const,
      demandOption: false,
      default: 10,
      description: "Number of todos to seed.",
    },
  },
  async ({ execute, workspaceId, spaceId, userId, count }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }
    if (!space.isProject()) {
      throw new Error(`Space ${spaceId} is not a project.`);
    }

    // Resolve target users.
    let users: Awaited<ReturnType<typeof UserResource.fetchByModelIds>>;

    if (userId) {
      const [user] = await UserResource.fetchByIds([userId]);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      users = [user];
    } else {
      const { groupsToProcess } = await space.fetchManualGroupsMemberships(
        auth,
        {
          shouldIncludeAllMembers: false,
        }
      );

      users = uniqBy(
        (
          await concurrentExecutor(
            groupsToProcess,
            (group) => group.getActiveMembers(auth),
            { concurrency: 2 }
          )
        ).flat(),
        "sId"
      );

      if (users.length === 0) {
        throw new Error(`No active members found for space: ${spaceId}.`);
      }
    }

    const todos = randomTodos(count);

    logger.info(
      {
        workspaceId,
        spaceId,
        userCount: users.length,
        todoCount: todos.length,
        agentSuggestionCount: todos.filter((t) => t.isAgentSuggestion).length,
      },
      execute
        ? "Seeding project todos."
        : "Dry run: would seed project todos. Use --execute to run."
    );

    if (!execute) {
      for (const todo of todos) {
        logger.info({ todo }, "Would create todo.");
      }
      return;
    }

    for (const todo of todos) {
      const user = users[Math.floor(Math.random() * users.length)];

      const created = await ProjectTaskResource.makeNew(auth, {
        spaceId: space.id,
        userId: user.id,
        createdByType: "agent",
        createdByUserId: null,
        createdByAgentConfigurationId: BUTLER_AGENT_SID,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        text: todo.text,
        status: "todo",
        doneAt: null,
        actorRationale: null,
        agentInstructions: null,
        agentSuggestionStatus: todo.agentSuggestionStatus,
        agentSuggestionReviewedAt: null,
        agentSuggestionReviewedByUserId: null,
      });

      if (todo.deleted) {
        await created.softDelete(auth);
      } else if (todo.status && todo.status !== "todo") {
        await created.updateWithVersion(auth, {
          status: todo.status,
          ...(todo.status === "done"
            ? {
                doneAt: new Date(),
                markedAsDoneByType: todo.agentMarkedDone
                  ? ("agent" as const)
                  : ("user" as const),
                markedAsDoneByUserId: todo.agentMarkedDone ? null : user.id,
                markedAsDoneByAgentConfigurationId: todo.agentMarkedDone
                  ? BUTLER_AGENT_SID
                  : null,
                actorRationale: todo.agentRationale ?? null,
              }
            : {}),
        });
      }

      logger.info(
        {
          text: todo.text,
          assignedTo: user.sId,
          status: todo.deleted ? "deleted" : (todo.status ?? "todo"),
          isAgentSuggestion: todo.isAgentSuggestion,
        },
        "Created todo."
      );
    }

    logger.info({ count: todos.length }, "Done seeding project todos.");
  }
);
