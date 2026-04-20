import { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

// Matches the backend reconstruction precision: `createdAt > lastReadAt`. Sleep
// at least this long before applying diff-wave changes so their versions land
// strictly after the recorded lastReadAt timestamp.
const LAST_READ_BUFFER_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    withUnreadDiff: {
      alias: "u",
      type: "boolean" as const,
      default: false,
      description:
        "After the base seed, mark todos as read then apply a second wave of changes to produce a visible diff on next open.",
    },
  },
  async ({ execute, workspaceId, spaceId, userId, withUnreadDiff }, logger) => {
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

    if (!withUnreadDiff) {
      return;
    }

    // ── Second wave: simulate an "unread diff" the user will see animated. ──

    // upsertBySpace needs a user-scoped authenticator since it keys state per
    // (workspace, space, user).
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspaceId
    );

    await ProjectTodoStateResource.upsertBySpace(userAuth, {
      spaceId: space.id,
      lastReadAt: new Date(),
    });
    logger.info(
      { lastReadAt: new Date().toISOString() },
      "Marked project todos as read."
    );

    // Sleep so every subsequent version lands with `createdAt > lastReadAt`.
    await sleep(LAST_READ_BUFFER_MS);

    // (a) Create brand-new todos → will animate as "added". One of them starts
    // in "done" state so we can see a freshly-added, already-checked item.
    const newTodoSeeds = [
      { text: "Schedule Q4 planning kickoff", status: "todo" as const },
      {
        text: "Collect feedback on the new onboarding flow",
        status: "todo" as const,
      },
      {
        text: "Archive the retired beta landing page",
        status: "done" as const,
      },
    ];
    const newTodoTexts = newTodoSeeds.map((s) => s.text);
    for (const seed of newTodoSeeds) {
      const isDone = seed.status === "done";
      await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: user.id,
        createdByType: "user",
        createdByUserId: user.id,
        createdByAgentConfigurationId: null,
        markedAsDoneByType: isDone ? "user" : null,
        markedAsDoneByUserId: isDone ? user.id : null,
        markedAsDoneByAgentConfigurationId: null,
        category: "to_do",
        text: seed.text,
        status: seed.status,
        doneAt: isDone ? new Date() : null,
        actorRationale: null,
      });
      logger.info(
        { text: seed.text, status: seed.status },
        "Diff wave: created new todo."
      );
    }

    // Reload the current state so we can pick live todos for the other cases.
    const current = await ProjectTodoResource.fetchLatestBySpaceForUser(auth, {
      spaceId: space.id,
      userId: user.id,
    });

    // (b) Text changes: pick two todo / in_progress entries and rewrite them.
    const editableCandidates = current.filter(
      (t) =>
        (t.status === "todo" || t.status === "in_progress") &&
        !newTodoTexts.includes(t.text)
    );
    const textEdits = editableCandidates.slice(0, 2);
    for (const todo of textEdits) {
      const nextText = `${todo.text} (updated)`;
      await todo.updateWithVersion(auth, { text: nextText });
      logger.info(
        { previous: todo.text, next: nextText },
        "Diff wave: updated todo text."
      );
    }

    // (c) Status → done: pick up to two in_progress entries untouched by the
    // edit pass and mark them as done to animate the checkbox.
    const editedIds = new Set(textEdits.map((t) => t.id));
    const toDoneCandidates = current
      .filter((t) => t.status === "in_progress" && !editedIds.has(t.id))
      .slice(0, 2);
    for (const todo of toDoneCandidates) {
      await todo.updateWithVersion(auth, {
        status: "done",
        doneAt: new Date(),
        markedAsDoneByType: "user",
        markedAsDoneByUserId: user.id,
        markedAsDoneByAgentConfigurationId: null,
      });
      logger.info({ text: todo.text }, "Diff wave: marked todo as done.");
    }

    logger.info("Done seeding unread diff.");
  }
);
