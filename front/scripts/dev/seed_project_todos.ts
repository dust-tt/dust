import { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

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
  // Current version, done.
  {
    text: "Send weekly status report to stakeholders",
    status: "done" as const,
  },
  // Will be set to done with an older version (simulates a todo created, then marked done).
  {
    text: "Fix broken link in the FAQ page",
    status: "done" as const,
    withOlderVersion: true,
  },
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
      description: "User sId.",
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
      // Create every todo in initial "todo" status.
      const todo = await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: user.id,
        createdByType: "user",
        createdByUserId: user.id,
        createdByAgentConfigurationId: null,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        category: "to_do",
        text: seed.text,
        status: "todo",
        doneAt: null,
        actorRationale: null,
      });

      if (seed.deleted) {
        // Soft-delete: creates a version (the original "todo" state) then sets deletedAt.
        await todo.softDelete(auth);
        logger.info({ text: seed.text }, "Created and soft-deleted todo.");
      } else if (seed.status) {
        if (seed.withOlderVersion) {
          // First move to an intermediate state to create version history.
          // This simulates a todo that went through a status change.
          await todo.updateWithVersion(auth, {
            status: seed.status,
            ...(seed.status === "done"
              ? {
                  doneAt: new Date(),
                  markedAsDoneByType: "user",
                  markedAsDoneByUserId: user.id,
                  markedAsDoneByAgentConfigurationId: null,
                }
              : {}),
          });
          logger.info(
            { text: seed.text, status: seed.status },
            "Created todo with older version."
          );
        } else {
          // Update directly (still creates a version of the original state).
          await todo.updateWithVersion(auth, {
            status: seed.status,
            ...(seed.status === "done"
              ? {
                  doneAt: new Date(),
                  markedAsDoneByType: "user",
                  markedAsDoneByUserId: user.id,
                  markedAsDoneByAgentConfigurationId: null,
                }
              : {}),
          });
          logger.info(
            { text: seed.text, status: seed.status },
            "Created todo with status update."
          );
        }
      } else {
        logger.info({ text: seed.text }, "Created todo.");
      }
    }

    logger.info({ count: SEED_TODOS.length }, "Done seeding project todos.");
  }
);
