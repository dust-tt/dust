import type { Logger } from "pino";
import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Ensures a latest `content_fragments` row exists for every ready project_context
 * file (historical data before dual-write on upsert). Does not call Core — front DB only.
 */

async function findWorkspaceModelIdsWithProjectContextFiles(): Promise<
  ModelId[]
> {
  const rows = await frontSequelize.query<{ workspaceId: ModelId }>(
    `SELECT DISTINCT "workspaceId" FROM files WHERE "useCase" = :useCase ORDER BY "workspaceId" ASC`,
    {
      replacements: { useCase: "project_context" },
      type: QueryTypes.SELECT,
    }
  );
  return rows.map((r) => r.workspaceId);
}

async function backfillProjectContentFragmentsForWorkspace(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<{ fileCount: number; upserted: number; errors: number }> {
  const projectSpaces = await SpaceModel.findAll({
    where: {
      workspaceId: workspace.id,
      kind: "project",
      deletedAt: null,
    },
  });

  if (projectSpaces.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No project spaces found, skipping"
    );
    return { fileCount: 0, upserted: 0, errors: 0 };
  }

  const baseAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const perSpaceStats = await concurrentExecutor(
    projectSpaces,
    async (spaceModel) => {
      // fromModel expects `groups` included on the Sequelize instance; plain findAll does not load it.
      const space = new SpaceResource(SpaceModel, spaceModel.get(), []);
      const files = await FileResource.listByProject(baseAuth, {
        projectId: space.sId,
      });

      const creatorModelIds = removeNulls([
        ...new Set(files.map((f) => f.userId)),
      ]);
      const creators =
        creatorModelIds.length > 0
          ? await UserResource.fetchByModelIds(creatorModelIds)
          : [];
      const creatorByModelId = new Map(creators.map((u) => [u.id, u]));

      const fragmentAuthByUserSId = new Map<string, Authenticator>();

      async function fragmentAuthForFile(
        file: FileResource
      ): Promise<Authenticator> {
        if (file.userId == null) {
          return baseAuth;
        }
        const creator = creatorByModelId.get(file.userId);
        if (!creator) {
          return baseAuth;
        }
        let cached = fragmentAuthByUserSId.get(creator.sId);
        if (!cached) {
          const auth = await Authenticator.fromUserIdAndWorkspaceId(
            creator.sId,
            workspace.sId
          );
          cached = auth.user() ? auth : baseAuth;
          fragmentAuthByUserSId.set(creator.sId, cached);
        }
        return cached;
      }

      let fileCount = 0;
      let upserted = 0;
      let errors = 0;

      for (const file of files) {
        fileCount++;
        if (!execute) {
          continue;
        }

        const fragmentAuth = await fragmentAuthForFile(file);

        const r = await ContentFragmentResource.upsertLatestProjectFileFragment(
          fragmentAuth,
          space,
          file
        );

        if (r.isErr()) {
          errors++;
          logger.warn(
            {
              workspaceId: workspace.sId,
              spaceId: space.sId,
              fileId: file.sId,
              error: r.error.message,
            },
            "Failed to upsert project content fragment for file"
          );
        } else {
          upserted++;
        }
      }

      return { fileCount, upserted, errors };
    },
    { concurrency: 4 }
  );

  const fileCount = perSpaceStats.reduce((a, s) => a + s.fileCount, 0);
  const upserted = perSpaceStats.reduce((a, s) => a + s.upserted, 0);
  const errors = perSpaceStats.reduce((a, s) => a + s.errors, 0);

  logger.info(
    {
      workspaceId: workspace.sId,
      projectSpaceCount: projectSpaces.length,
      fileCount,
      ...(execute ? { upserted, errors } : {}),
    },
    execute
      ? "Project content fragment backfill finished for workspace"
      : "Dry run: counted project_context files for workspace (no writes)"
  );

  return { fileCount, upserted, errors };
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info(
      { execute },
      "Starting backfill: project_context files → content_fragments"
    );

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillProjectContentFragmentsForWorkspace(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      const workspaceModelIds =
        await findWorkspaceModelIdsWithProjectContextFiles();

      logger.info(
        { workspaceCount: workspaceModelIds.length },
        "Workspaces with at least one project_context file"
      );

      if (workspaceModelIds.length === 0) {
        logger.info("Nothing to backfill");
      } else {
        const workspaces =
          await WorkspaceResource.fetchByModelIds(workspaceModelIds);

        const foundIds = new Set(workspaces.map((w) => w.id));
        const missingIds = workspaceModelIds.filter((id) => !foundIds.has(id));
        if (missingIds.length > 0) {
          logger.warn(
            { missingWorkspaceModelIds: missingIds },
            "Some workspaceIds from files are missing from workspaces table; skipping those"
          );
        }

        await concurrentExecutor(
          workspaces.map((ws) => renderLightWorkspaceType({ workspace: ws })),
          async (workspace) => {
            await backfillProjectContentFragmentsForWorkspace(
              execute,
              logger,
              workspace
            );
          },
          { concurrency: 4 }
        );
      }
    }

    logger.info("Project content fragment backfill completed");
  }
);
