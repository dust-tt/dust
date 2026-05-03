import { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

// Mirrors the sentinel used by the butler merge workflow.
const BUTLER_AGENT_SID = "butler";

const SEED_TODOS = [
  // Current version, in progress.
  {
    text: "Review the Q3 roadmap document and add comments",
    status: "in_progress" as const,
  },
  {
    text: "Update the onboarding checklist for new hires",
    status: "in_progress" as const,
  },
  // Current version, done — marked done by agent.
  {
    text: "Send weekly status report to stakeholders",
    status: "done" as const,
    agentMarkedDone: true,
    agentRationale:
      "Detected in the #weekly-updates Slack thread: report was shared and acknowledged by the team.",
  },
  // Will be set to done with an older version (simulates a todo created, then marked done).
  // Marked done by agent.
  {
    text: "Fix broken link in the FAQ page",
    status: "done" as const,
    withOlderVersion: true,
    agentMarkedDone: true,
    agentRationale:
      "The broken link was replaced with the correct URL in the FAQ document.",
  },
  // Marked done by user.
  {
    text: "Archive completed sprint tickets",
    status: "done" as const,
    withOlderVersion: true,
  },
  // Will be set to in_progress with an older version (simulates a todo created, then moved to in_progress).
  {
    text: "Draft the API migration guide",
    status: "in_progress" as const,
    withOlderVersion: true,
  },
  {
    text: "Set up monitoring alerts for the new service",
    status: "in_progress" as const,
    withOlderVersion: true,
  },
  // Will be soft-deleted.
  {
    text: "Clean up unused feature flags",
    deleted: true,
  },
  {
    text: "Remove deprecated endpoint /v1/legacy",
    deleted: true,
  },
];

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
      demandOption: true,
      description: "User sId (used only to resolve the target space/user).",
    },
  },
  async ({ execute, workspaceId, spaceId, userId }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }
    if (!space.isProject()) {
      throw new Error(`Space ${spaceId} is not a project.`);
    }

    const [user] = await UserResource.fetchByIds([userId]);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    logger.info(
      {
        workspaceId,
        spaceId,
        userId,
        todoCount: SEED_TODOS.length,
      },
      execute
        ? "Seeding project todos."
        : "Dry run: would seed project todos. Use --execute to run."
    );

    if (!execute) {
      for (const seed of SEED_TODOS) {
        logger.info({ seed }, "Would create todo.");
      }
      return;
    }

    for (const seed of SEED_TODOS) {
      // All todos are created by the butler agent, mirroring merge_into_project.ts.
      const todo = await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: user.id,
        createdByType: "agent",
        createdByUserId: null,
        createdByAgentConfigurationId: BUTLER_AGENT_SID,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        text: seed.text,
        status: "todo",
        doneAt: null,
        actorRationale: null,
        agentInstructions: null,
      });

      if (seed.deleted) {
        await todo.softDelete(auth);
        logger.info({ text: seed.text }, "Created and soft-deleted todo.");
      } else if (seed.status) {
        const doneUpdates =
          seed.status === "done"
            ? {
                doneAt: new Date(),
                markedAsDoneByType: seed.agentMarkedDone
                  ? ("agent" as const)
                  : ("user" as const),
                markedAsDoneByUserId: seed.agentMarkedDone ? null : user.id,
                markedAsDoneByAgentConfigurationId: seed.agentMarkedDone
                  ? BUTLER_AGENT_SID
                  : null,
                actorRationale: seed.agentRationale ?? null,
              }
            : {};

        await todo.updateWithVersion(auth, {
          status: seed.status,
          ...doneUpdates,
        });

        logger.info(
          { text: seed.text, status: seed.status },
          seed.withOlderVersion
            ? "Created todo with older version."
            : "Created todo with status update."
        );
      } else {
        logger.info({ text: seed.text }, "Created todo.");
      }
    }

    logger.info({ count: SEED_TODOS.length }, "Done seeding project todos.");
  }
);
