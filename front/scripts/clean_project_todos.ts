import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  ProjectTodoConversationModel,
  ProjectTodoModel,
  ProjectTodoSourceModel,
  ProjectTodoVersionModel,
} from "@app/lib/resources/storage/models/project_todo";
import { ProjectTodoStateModel } from "@app/lib/resources/storage/models/project_todo_state";
import { ProjectTodoTakeawaySourcesModel } from "@app/lib/resources/storage/models/project_todo_takeaway_sources";
import {
  TakeawaySourcesModel,
  TakeawaysModel,
  TakeawaysVersionModel,
} from "@app/lib/resources/storage/models/takeaways";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import {
  launchOrSignalProjectTodoWorkflow,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_todo/client";

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to clean todos for.",
      demandOption: true,
    },
    projectId: {
      type: "string",
      describe: "Project (space) sId to clean todos for.",
      demandOption: true,
    },
    userId: {
      type: "string",
      describe:
        "Optional user sId to scope cleanup to a single owner. When omitted, " +
        "wipes todos for all users in the project plus project-wide takeaways.",
    },
  },
  async ({ execute, wId, projectId, userId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${wId}`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(wId);

    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space) {
      throw new Error(`Space not found: ${projectId}`);
    }
    if (space.kind !== "project") {
      throw new Error(
        `Space ${projectId} is not a project space (kind=${space.kind}).`
      );
    }

    let userModelId: number | null = null;
    if (userId) {
      const user = await UserResource.fetchById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      userModelId = user.id;
    }

    const workspaceId = workspace.id;
    const spaceId = space.id;
    const todoWhere = {
      workspaceId,
      spaceId,
      ...(userModelId !== null ? { userId: userModelId } : {}),
    };

    const todos = await ProjectTodoModel.findAll({
      where: todoWhere,
      attributes: ["id"],
    });
    const todoIds = todos.map((t) => t.id);

    const takeaways =
      userModelId === null
        ? await TakeawaysModel.findAll({
            where: { workspaceId, spaceId },
            attributes: ["id"],
          })
        : [];
    const takeawaysIds = takeaways.map((t) => t.id);

    logger.info(
      {
        workspaceId: wId,
        spaceId: projectId,
        userId: userId ?? null,
        todoCount: todoIds.length,
        takeawaysCount: takeawaysIds.length,
        execute,
      },
      execute ? "Cleaning project todos" : "Dry run: would clean project todos"
    );

    if (!execute) {
      return;
    }

    logger.info(
      { workspaceId: wId, spaceId: projectId },
      "Stopping project todo workflow"
    );
    await stopProjectTodoWorkflow({
      workspaceId: wId,
      spaceId: projectId,
      stopReason: "clean_project_todos script",
    });

    await frontSequelize.transaction(async (transaction) => {
      if (todoIds.length > 0) {
        const todoChildWhere = { workspaceId, projectTodoId: todoIds };

        const versionDeleted = await ProjectTodoVersionModel.destroy({
          where: todoWhere,
          transaction,
        });
        const conversationDeleted = await ProjectTodoConversationModel.destroy({
          where: todoChildWhere,
          transaction,
        });
        const sourceDeleted = await ProjectTodoSourceModel.destroy({
          where: todoWhere,
          transaction,
        });
        const takeawayLinkDeleted =
          await ProjectTodoTakeawaySourcesModel.destroy({
            where: todoChildWhere,
            transaction,
          });
        const todoDeleted = await ProjectTodoModel.destroy({
          where: todoWhere,
          transaction,
        });

        logger.info(
          {
            versionDeleted,
            conversationDeleted,
            sourceDeleted,
            takeawayLinkDeleted,
            todoDeleted,
          },
          "Deleted project todo rows"
        );
      }

      const stateDeleted = await ProjectTodoStateModel.destroy({
        where: {
          workspaceId,
          spaceId: spaceId,
          ...(userModelId !== null ? { userId: userModelId } : {}),
        },
        transaction,
      });
      logger.info({ stateDeleted }, "Deleted project todo state rows");

      if (takeawaysIds.length > 0) {
        const takeawayChildWhere = {
          workspaceId,
          takeawaysId: takeawaysIds,
        };

        const takeawaySourceDeleted = await TakeawaySourcesModel.destroy({
          where: takeawayChildWhere,
          transaction,
        });
        const takeawayVersionDeleted = await TakeawaysVersionModel.destroy({
          where: takeawayChildWhere,
          transaction,
        });
        const takeawayDeleted = await TakeawaysModel.destroy({
          where: { workspaceId, spaceId: spaceId },
          transaction,
        });

        logger.info(
          {
            takeawaySourceDeleted,
            takeawayVersionDeleted,
            takeawayDeleted,
          },
          "Deleted takeaway rows"
        );
      }
    });

    logger.info(
      { workspaceId: wId, spaceId: projectId },
      "Restarting project todo workflow"
    );
    await launchOrSignalProjectTodoWorkflow({
      workspaceId: wId,
      spaceId: projectId,
    });

    logger.info(
      { workspaceId: wId, spaceId: projectId, userId: userId ?? null },
      "Clean project todos complete"
    );
  }
);
