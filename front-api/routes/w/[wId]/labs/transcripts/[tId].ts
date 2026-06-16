import {
  type GetLabsTranscriptsConfigurationResponseBody as GetResponseBody,
  PatchLabsTranscriptsConfigurationBodySchema,
} from "@app/lib/api/labs/transcripts";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { isProviderWithDefaultWorkspaceConfiguration } from "@app/types/oauth/lib";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const NOT_FOUND_ERROR: APIErrorWithContentfulStatusCode = {
  status_code: 404,
  api_error: {
    type: "transcripts_configuration_not_found",
    message: "The transcript configuration was not found.",
  },
};

type LoadResult =
  | { ok: true; configuration: LabsTranscriptsConfigurationResource }
  | { ok: false; response: ReturnType<typeof apiError> };

const ParamsSchema = z.object({
  tId: z.string(),
});

async function loadOwnedConfiguration(
  ctx: Context,
  auth: Authenticator,
  transcriptsConfigurationId: string
): Promise<LoadResult> {
  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchById(
      auth,
      transcriptsConfigurationId
    );
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();
  if (
    !transcriptsConfiguration ||
    transcriptsConfiguration.userId !== user.id ||
    transcriptsConfiguration.workspaceId !== owner.id
  ) {
    return { ok: false, response: apiError(ctx, NOT_FOUND_ERROR) };
  }

  return { ok: true, configuration: transcriptsConfiguration };
}

// Mounted at /api/w/:wId/labs/transcripts/:tId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetResponseBody> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const loadRes = await loadOwnedConfiguration(ctx, auth, tId);
    if (!loadRes.ok) {
      return loadRes.response;
    }

    return ctx.json({ configuration: loadRes.configuration.toJSON() });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchLabsTranscriptsConfigurationBodySchema),
  async (ctx): HandlerResult<GetResponseBody> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const loadRes = await loadOwnedConfiguration(ctx, auth, tId);
    if (!loadRes.ok) {
      return loadRes.response;
    }
    const transcriptsConfiguration = loadRes.configuration;

    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration, false);

    const {
      agentConfigurationId: patchAgentId,
      isActive,
      status,
      dataSourceViewId,
    } = ctx.req.valid("json");

    if (patchAgentId) {
      await transcriptsConfiguration.setAgentConfigurationId({
        agentConfigurationId: patchAgentId,
      });
    }

    const newStatus =
      status ??
      (isActive !== undefined ? (isActive ? "active" : "disabled") : undefined);

    if (newStatus !== undefined) {
      logger.info(
        {
          transcriptsConfigurationId: transcriptsConfiguration.sId,
          status: newStatus,
        },
        "Setting transcript configuration status."
      );
      await transcriptsConfiguration.setStatus(newStatus);
    }

    if (dataSourceViewId !== undefined) {
      const dataSourceView = dataSourceViewId
        ? await DataSourceViewResource.fetchById(auth, dataSourceViewId)
        : null;

      if (dataSourceView) {
        const canWrite = dataSourceView.canWrite(auth);
        if (!canWrite) {
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "data_source_auth_error",
              message:
                "The user does not have permission to write to the datasource view.",
            },
          });
        }
      }

      await transcriptsConfiguration.setDataSourceView(dataSourceView);

      if (
        isProviderWithDefaultWorkspaceConfiguration(
          transcriptsConfiguration.provider
        )
      ) {
        const defaultFullStorageConfiguration =
          await LabsTranscriptsConfigurationResource.fetchDefaultConfigurationForWorkspace(
            auth.getNonNullableWorkspace()
          );
        if (defaultFullStorageConfiguration === null) {
          await transcriptsConfiguration.setIsDefault(!!dataSourceViewId);
        }
      }
    }

    const updatedTranscriptsConfiguration =
      await LabsTranscriptsConfigurationResource.fetchById(
        auth,
        transcriptsConfiguration.sId
      );

    if (!updatedTranscriptsConfiguration) {
      return apiError(ctx, NOT_FOUND_ERROR);
    }

    const shouldStartWorkflow =
      updatedTranscriptsConfiguration.isActive() ||
      !!updatedTranscriptsConfiguration.dataSourceViewId;

    if (shouldStartWorkflow) {
      logger.info(
        {
          transcriptsConfigurationId: updatedTranscriptsConfiguration.sId,
        },
        "Starting transcript retrieval workflow."
      );
      await launchRetrieveTranscriptsWorkflow(updatedTranscriptsConfiguration);
    }

    return ctx.json({
      configuration: updatedTranscriptsConfiguration.toJSON(),
    });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetResponseBody> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const loadRes = await loadOwnedConfiguration(ctx, auth, tId);
    if (!loadRes.ok) {
      return loadRes.response;
    }
    const transcriptsConfiguration = loadRes.configuration;

    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    await transcriptsConfiguration.delete(auth);

    return ctx.json({ configuration: null });
  }
);

export default app;
