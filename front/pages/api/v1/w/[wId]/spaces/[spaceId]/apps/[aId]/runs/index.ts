import type { RunAppResponseType } from "@dust-tt/client";
import { createParser } from "eventsource-parser";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  BlockType,
  CredentialsType,
  ModelIdType,
  ModelProviderIdType,
  RunType,
  TraceType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  assertNever,
  CoreAPI,
  credentialsFromProviders,
  dustManagedCredentials,
} from "@app/types";

export const config = {
  api: {
    responseLimit: "8mb",
    bodyParser: {
      // 1m context size models at 4b/token (plain english) gives us an upper bound of 4mb.
      sizeLimit: "4mb",
    },
  },
};

type RunFlavor = "blocking" | "streaming" | "non-blocking";

type Trace = [[BlockType, string], TraceType[][]];

function extractUsageFromExecutions(
  block: { provider_id: ModelProviderIdType; model_id: ModelIdType },
  traces: TraceType[][]
): RunUsageType[] {
  if (!block) {
    return [];
  }

  const usages: RunUsageType[] = [];

  traces.forEach((tracesInner) => {
    tracesInner.forEach((trace) => {
      if (trace?.meta) {
        const { token_usage } = trace.meta as {
          token_usage: {
            prompt_tokens: number;
            completion_tokens: number;
            cached_tokens?: number;
            reasoning_tokens?: number;
          };
        };
        if (token_usage) {
          const promptTokens = token_usage.prompt_tokens;
          const completionTokens = token_usage.completion_tokens;
          const cachedTokens = token_usage.cached_tokens;

          usages.push({
            providerId: block.provider_id,
            modelId: block.model_id,
            promptTokens,
            completionTokens,
            cachedTokens: cachedTokens ?? null,
          });
        }
      }
    });
  });

  return usages;
}

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RunAppResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource },
  keyAuth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const keyWorkspaceId = keyAuth.getNonNullableWorkspace().id;
  const [app, providers, secrets] = await Promise.all([
    AppResource.fetchById(auth, req.query.aId as string),
    Provider.findAll({
      where: {
        workspaceId: keyWorkspaceId,
      },
    }),
    getDustAppSecrets(auth, true),
  ]);

  if (!app || app.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  if (!app.canRead(keyAuth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_not_found",
        message: "Running an app requires read access to the app's space.",
      },
    });
  }

  // This variable is used in the context of the DustAppRun action to use the workspace credentials
  // instead of our managed credentials when running an app with a system API key.
  const useWorkspaceCredentials =
    req.query["use_workspace_credentials"] === "true";
  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const runFlavor: RunFlavor = req.body.stream
    ? "streaming"
    : req.body.blocking
      ? "blocking"
      : "non-blocking";

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.specification_hash === "string") ||
        !(typeof req.body.config === "object" && req.body.config !== null) ||
        !Array.isArray(req.body.inputs)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, `specification_hash` (string), `config` (object), and `inputs` (array) are required.",
          },
        });
      }

      const config = req.body.config;
      const inputs = req.body.inputs;
      const specificationHash = req.body.specification_hash;

      for (const name in config) {
        const c = config[name];
        if (c.type == "input") {
          delete c.dataset;
        }
      }

      // Fetch the feature flags for the owner of the run.
      const keyWorkspaceFlags = await getFeatureFlags(
        keyAuth.getNonNullableWorkspace()
      );

      // When this is on, two things happen:
      // 1) We use the OpenAI EU endpoint (in Core)
      // 2) We use the DUST_MANAGED_OPENAI_API_KEY_EU env as the key
      const useOpenAIEUKey =
        keyWorkspaceFlags.includes("use_openai_eu_key") &&
        !!process.env.DUST_MANAGED_OPENAI_API_KEY_EU;

      let credentials: CredentialsType | null = null;
      if (auth.isSystemKey() && !useWorkspaceCredentials) {
        // Dust managed credentials: system API key (packaged apps).
        credentials = dustManagedCredentials({ useOpenAIEU: useOpenAIEUKey });
      } else {
        credentials = credentialsFromProviders(providers);
      }

      if (!auth.isSystemKey()) {
        const remaining = await rateLimiter({
          key: `app_run:w:${owner.sId}:a:${app.sId}`,
          maxPerTimeframe: 10000,
          timeframeSeconds: 60 * 60 * 24,
          logger: logger,
        });
        if (remaining === 0) {
          return apiError(req, res, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: `You have reached the maximum number of 10000 runs over the last 24 hours.`,
            },
          });
        }
      }

      // Fetch the feature flags of the app's workspace.
      const flags = await getFeatureFlags(owner);
      const storeBlocksResults = !flags.includes("disable_run_logs");

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
          app: app.sId,
          useOpenAIEU: useOpenAIEUKey,
        },
        "App run creation"
      );

      if (useOpenAIEUKey && config.MODEL) {
        config.MODEL.use_openai_eu_key = true;
      }

      const runRes = await coreAPI.createRunStream(
        keyAuth.getNonNullableWorkspace(),
        keyWorkspaceFlags,
        keyAuth.groups(),
        {
          projectId: app.dustAPIProjectId,
          runType: "deploy",
          specificationHash: specificationHash,
          config: { blocks: config },
          inputs,
          credentials,
          secrets,
          isSystemKey: auth.isSystemKey(),
          storeBlocksResults,
        }
      );

      if (runRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "run_error",
            message: "There was an error running the app.",
            run_error: runRes.error,
          },
        });
      }

      switch (runFlavor) {
        case "streaming":
          // Start SSE stream.
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          break;
        case "blocking":
          // Blocking, nothing to do for now
          break;

        case "non-blocking":
          // Non blocking, return a run object as soon as we get the runId.
          void (async () => {
            const dustRunId = await runRes.value.dustRunId;

            const statusRunRes = await coreAPI.getRunStatus({
              projectId: app.dustAPIProjectId,
              runId: dustRunId,
            });

            if (statusRunRes.isErr()) {
              return apiError(req, res, {
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

            res.status(200).json({ run: run as RunType });
          })();
          break;

        default:
          assertNever(runFlavor);
      }

      const usages: RunUsageType[] = [];
      const traces: Trace[] = [];
      let dustRunId: string | undefined;

      try {
        // Intercept block_execution events to store token usages.
        const parser = createParser((event) => {
          if (event.type === "event") {
            if (event.data) {
              try {
                const data = JSON.parse(event.data);
                if (data.type === "block_execution") {
                  if (runFlavor === "blocking") {
                    // Keep track of block executions for blocking requests.
                    traces.push([
                      [data.content.block_type, data.content.block_name],
                      data.content.execution,
                    ]);
                  }
                  const block = config[data.content.block_name];

                  const blockUsages = extractUsageFromExecutions(
                    block,
                    data.content.execution
                  );
                  usages.push(...blockUsages);
                }
              } catch (err) {
                logger.error(
                  { error: err },
                  "Error parsing run events while extracting usage from executions"
                );
              }
            }
          }
        });

        for await (const chunk of runRes.value.chunkStream) {
          parser.feed(new TextDecoder().decode(chunk));
          if (runFlavor === "streaming") {
            res.write(chunk);
            // @ts-expect-error we need to flush for streaming but TS thinks flush() does not exists.
            res.flush();
          }
        }

        // TODO(2025-04-23): We should record usage earlier, as soon as we get the runId. So we know
        // that the run is available before we yield the "agent_message_success" event.
        dustRunId = await runRes.value.dustRunId;
        const run = await RunResource.makeNew({
          dustRunId,
          appId: app.id,
          runType: "deploy",
          workspaceId: keyWorkspaceId,
        });

        await run.recordRunUsage(usages);
      } catch (err) {
        logger.error(
          {
            error: err,
          },
          "Error streaming from Dust API"
        );

        if (runFlavor === "streaming") {
          res.end();
        }

        throw err;
      }

      switch (runFlavor) {
        case "streaming":
          // End SSE stream.
          res.end();
          return;

        case "blocking":
          // Blocking, return the run status.
          const statusRunRes = await coreAPI.getRunStatus({
            projectId: app.dustAPIProjectId,
            runId: dustRunId,
          });

          if (statusRunRes.isErr()) {
            return apiError(req, res, {
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

          if (req.body.block_filter && Array.isArray(req.body.block_filter)) {
            run.traces = run.traces.filter((t: any) => {
              return req.body.block_filter.includes(t[0][1]);
            });

            run.status.blocks = run.status.blocks.filter((c: any) => {
              return req.body.block_filter.includes(c.name);
            });
          }

          if (run.status.run === "succeeded" && run.traces.length > 0) {
            run.results = run.traces[run.traces.length - 1][1];
          } else {
            run.results = null;
          }

          res.status(200).json({ run: run as RunType });
          return;

        case "non-blocking":
          // Response already sent earlier in async block.
          return;

        default:
          assertNever(runFlavor);
      }
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  // Check read on the workspace authenticator - for public space, everybody can read
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } }),
  {
    allowUserOutsideCurrentWorkspace: true,
  }
);
