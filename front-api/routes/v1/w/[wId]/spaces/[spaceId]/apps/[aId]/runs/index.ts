import apiConfig from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { consumeRunStream } from "@app/lib/api/run";
import { getFeatureFlags } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import {
  credentialsFromProviders,
  dustManagedServiceCredentials,
} from "@app/types/api/credentials";
import { CoreAPI } from "@app/types/core/core_api";
import type { CredentialsType } from "@app/types/provider";
import type { RunType } from "@app/types/run";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { stream } from "hono/streaming";
import { z } from "zod";

import runId from "./[runId]";

type RunFlavor = "blocking" | "streaming" | "non-blocking";

const ParamsSchema = z.object({
  aId: z.string(),
});

const PostRunRequestBodySchema = z.object({
  specification_hash: z.string(),
  config: z.record(z.string(), z.any()),
  inputs: z.array(z.any()),
  stream: z.boolean().optional(),
  blocking: z.boolean().optional(),
  block_filter: z.array(z.string()).optional(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/apps/{aId}/runs:
 *   post:
 *     summary: Create an app run
 *     description: Create and execute a run for an app in the space specified by {spaceId}.
 *     tags:
 *       - Apps
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: aId
 *         required: true
 *         description: Unique identifier of the app
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - specification_hash
 *               - config
 *               - inputs
 *             properties:
 *               specification_hash:
 *                 type: string
 *                 description: Hash of the app specification. Ensures API compatibility across app iterations.
 *               config:
 *                 type: object
 *                 description: Configuration for the app run
 *                 properties:
 *                   model:
 *                     type: object
 *                     description: Model configuration
 *                     properties:
 *                       provider_id:
 *                         type: string
 *                         description: ID of the model provider
 *                       model_id:
 *                         type: string
 *                         description: ID of the model
 *                       use_cache:
 *                         type: boolean
 *                         description: Whether to use caching
 *                       use_stream:
 *                         type: boolean
 *                         description: Whether to use streaming
 *               inputs:
 *                 type: array
 *                 description: Array of input objects for the app
 *                 items:
 *                   type: object
 *                   additionalProperties: true
 *               stream:
 *                 type: boolean
 *                 description: If true, the response will be streamed
 *               blocking:
 *                 type: boolean
 *                 description: If true, the request will block until the run is complete
 *               block_filter:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of block names to filter the response
 *     responses:
 *       200:
 *         description: App run created and executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   $ref: '#/components/schemas/Run'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace or app not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
const app = publicApiApp();

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("param", ParamsSchema),
  validate("json", PostRunRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const owner = auth.getNonNullableWorkspace();
    const [appResource, providers, secrets] = await Promise.all([
      AppResource.fetchById(auth, aId),
      ProviderModel.findAll({
        where: {
          workspaceId: owner.id,
        },
      }),
      getDustAppSecrets(auth, true),
    ]);

    if (!appResource || appResource.space.sId !== space.sId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "app_not_found",
          message: "The app you're trying to run was not found",
        },
      });
    }

    if (!appResource.canRead(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_not_found",
          message: "Running an app requires read access to the app's space.",
        },
      });
    }

    // This variable defines whether to use the dust managed credentials or the workspace credentials.
    // Dust managed credentials can only be used with a system API key.
    // The `use_workspace_credentials` query parameter is used in the context of the DustAppRun action, to
    // use the workspace credentials even though we use a system API key.
    const useDustCredentials =
      auth.isSystemKey() &&
      ctx.req.query("use_workspace_credentials") !== "true";

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const runFlavor: RunFlavor = body.stream
      ? "streaming"
      : body.blocking
        ? "blocking"
        : "non-blocking";

    const config = body.config;
    const inputs = body.inputs;
    const specificationHash = body.specification_hash;

    for (const name in config) {
      const c = config[name];
      if (c.type == "input") {
        delete c.dataset;
      }
    }

    // Fetch the feature flags for the owner of the run.
    const keyWorkspaceFlags = await getFeatureFlags(auth);

    let credentials: CredentialsType | null = null;
    if (useDustCredentials) {
      const llmCredentials = await getLlmCredentials(auth);
      // Dust managed credentials: system API key (packaged apps).
      credentials = {
        ...llmCredentials,
        ...dustManagedServiceCredentials(),
      };
    } else {
      credentials = credentialsFromProviders(providers);
    }

    if (!auth.isSystemKey()) {
      const remaining = await rateLimiter({
        key: `app_run:w:${owner.sId}:a:${appResource.sId}`,
        maxPerTimeframe: 10000,
        timeframeSeconds: 60 * 60 * 24,
        logger: logger,
      });
      if (remaining === 0) {
        return apiError(ctx, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: `You have reached the maximum number of 10000 runs over the last 24 hours.`,
          },
        });
      }
    }

    // Fetch the feature flags of the app's workspace.
    const flags = await getFeatureFlags(auth);
    const storeBlocksResults = !flags.includes("disable_run_logs");

    logger.info(
      {
        workspace: {
          sId: owner.sId,
          name: owner.name,
        },
        app: appResource.sId,
        useOpenAIEUEndpoint: credentials?.OPENAI_USE_EU_ENDPOINT,
      },
      "App run creation"
    );

    const runRes = await coreAPI.createRunStream(owner, keyWorkspaceFlags, {
      projectId: appResource.dustAPIProjectId,
      runType: "deploy",
      specificationHash: specificationHash,
      config: { blocks: config },
      inputs,
      credentials,
      secrets,
      storeBlocksResults,
    });

    if (runRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "run_error",
          message: "There was an error running the app.",
          run_error: runRes.error,
        },
      });
    }

    const runStreamArgs = {
      auth,
      appModelId: appResource.id,
      workspaceModelId: owner.id,
      useDustCredentials,
      blocksConfig: config,
      runStream: runRes.value,
    };

    switch (runFlavor) {
      case "streaming": {
        ctx.header("Content-Type", "text/event-stream");
        ctx.header("Cache-Control", "no-cache");
        ctx.header("Connection", "keep-alive");
        ctx.header("X-Accel-Buffering", "no");
        ctx.header("Content-Encoding", "none");

        return stream(ctx, async (s) => {
          try {
            await consumeRunStream({
              ...runStreamArgs,
              collectTraces: false,
              onChunk: async (chunk) => {
                await s.write(chunk);
              },
            });
          } catch (err) {
            logger.error({ error: err }, "Error streaming from Dust API");
          }
        });
      }

      case "blocking": {
        let traces;
        let dustRunId: string;
        try {
          const result = await consumeRunStream({
            ...runStreamArgs,
            collectTraces: true,
          });
          traces = result.traces;
          dustRunId = result.dustRunId;
        } catch (err) {
          logger.error({ error: err }, "Error streaming from Dust API");
          throw err;
        }

        const statusRunRes = await coreAPI.getRunStatus({
          projectId: appResource.dustAPIProjectId,
          runId: dustRunId,
        });

        if (statusRunRes.isErr()) {
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "run_error",
              message: "There was an error getting the app run details.",
              run_error: statusRunRes.error,
            },
          });
        }

        const run: RunType = statusRunRes.value.run;
        run.specification_hash = run.app_hash;
        delete run.app_hash;

        run.traces = traces;

        if (body.block_filter && Array.isArray(body.block_filter)) {
          const blockFilter = body.block_filter;
          run.traces = run.traces.filter((t: any) => {
            return blockFilter.includes(t[0][1]);
          });

          run.status.blocks = run.status.blocks.filter((c: any) => {
            return blockFilter.includes(c.name);
          });
        }

        if (run.status.run === "succeeded" && run.traces.length > 0) {
          run.results = run.traces[run.traces.length - 1][1];
        } else {
          run.results = null;
        }

        return ctx.json({ run: run as RunType });
      }

      case "non-blocking": {
        // Get the runId so we can return the status, then kick off the background
        // stream consumption (which records run usage) without awaiting.
        const dustRunId = await runRes.value.dustRunId;

        const statusRunRes = await coreAPI.getRunStatus({
          projectId: appResource.dustAPIProjectId,
          runId: dustRunId,
        });

        if (statusRunRes.isErr()) {
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "run_error",
              message: "There was an error getting the app run status.",
              run_error: statusRunRes.error,
            },
          });
        }

        const run: RunType = statusRunRes.value.run;
        run.specification_hash = run.app_hash;
        delete run.app_hash;

        run.status.blocks = [];
        run.results = null;

        // Fire-and-forget: continue draining the stream and recording usage.
        void (async () => {
          try {
            await consumeRunStream({
              ...runStreamArgs,
              collectTraces: false,
            });
          } catch (err) {
            logger.error({ error: err }, "Error streaming from Dust API");
          }
        })();

        return ctx.json({ run: run as RunType });
      }

      default:
        assertNever(runFlavor);
    }
  }
);

app.route("/:runId", runId);

export default app;
