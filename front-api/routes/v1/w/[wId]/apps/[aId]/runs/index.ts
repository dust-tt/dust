/* eslint-disable dust/enforce-client-types-in-public-api */
import apiConfig from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { extractUsageFromExecutions } from "@app/lib/api/run";
import { getFeatureFlags } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import {
  credentialsFromProviders,
  dustManagedServiceCredentials,
} from "@app/types/api/credentials";
import { CoreAPI } from "@app/types/core/core_api";
import type { CredentialsType } from "@app/types/provider";
import type { BlockType, RunType, TraceType } from "@app/types/run";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuthAllowSystemKeyBypassBuilderCheck } from "@front-api/middlewares/public_api_auth";
import { setSSEHeaders } from "@front-api/middlewares/streaming";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { createParser } from "eventsource-parser";
import { stream } from "hono/streaming";
import { z } from "zod";

import runId from "./[runId]";

type RunFlavor = "blocking" | "streaming" | "non-blocking";

type Trace = [[BlockType, string], TraceType[][]];

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/v1/w/:wId/apps/:aId/runs. This is a legacy endpoint: the
// space is not in the URL, so the global workspace space is assumed (mirroring
// `withResourceFetchingFromRoute` with `requireCanRead`).
const app = publicApiApp();

app.route("/:runId", runId);

/**
 * @ignoreswagger
 * Legacy endpoint.
 */
app.post(
  "/",
  publicApiAuthAllowSystemKeyBypassBuilderCheck,
  validate("param", ParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    if (!space.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you requested was not found.",
        },
      });
    }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = await ctx.req.json();
    } catch {
      body = undefined;
    }

    const runFlavor: RunFlavor = body?.stream
      ? "streaming"
      : body?.blocking
        ? "blocking"
        : "non-blocking";

    if (
      !body ||
      !(typeof body.specification_hash === "string") ||
      !(typeof body.config === "object" && body.config !== null) ||
      !Array.isArray(body.inputs)
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid request body, `specification_hash` (string), `config` (object), and `inputs` (array) are required.",
        },
      });
    }

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

    const usages: RunUsageType[] = [];
    const traces: Trace[] = [];

    // Consume the run stream: feed each chunk to the parser (to extract token
    // usages and, for blocking runs, traces), optionally forward each chunk to a
    // streaming sink, then record the run and its usage. Returns the run id.
    const consumeStream = async (
      onChunk?: (chunk: Uint8Array) => Promise<void>
    ): Promise<string> => {
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
        if (onChunk) {
          await onChunk(chunk);
        }
      }

      // TODO(2025-04-23): We should record usage earlier, as soon as we get the runId. So we know
      // that the run is available before we yield the "agent_message_success" event.
      const dustRunId = await runRes.value.dustRunId;
      const run = await RunResource.makeNew({
        dustRunId,
        appId: appResource.id,
        runType: "deploy",
        workspaceId: owner.id,
        useWorkspaceCredentials: !useDustCredentials,
      });

      await run.recordRunUsage(auth, usages);

      return dustRunId;
    };

    switch (runFlavor) {
      case "streaming": {
        // Start SSE stream.
        setSSEHeaders(ctx);

        return stream(ctx, async (s) => {
          try {
            await consumeStream(async (chunk) => {
              await s.write(chunk);
            });
          } catch (err) {
            logger.error(
              {
                error: err,
              },
              "Error streaming from Dust API"
            );
          }
        });
      }

      case "blocking": {
        let dustRunId: string;
        try {
          dustRunId = await consumeStream();
        } catch (err) {
          logger.error(
            {
              error: err,
            },
            "Error streaming from Dust API"
          );

          throw err;
        }

        // Blocking, return the run status.
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
          run.traces = run.traces.filter((t) =>
            body.block_filter.includes(t[0][1])
          );

          run.status.blocks = run.status.blocks.filter((c) =>
            body.block_filter.includes(c.name)
          );
        }

        if (run.status.run === "succeeded" && run.traces.length > 0) {
          run.results = run.traces[run.traces.length - 1][1];
        } else {
          run.results = null;
        }

        return ctx.json({ run });
      }

      case "non-blocking": {
        // Consume the stream in the background (this drives `dustRunId` resolution
        // and records usage), then return a run object as soon as we get the runId.
        void consumeStream().catch((err) => {
          logger.error(
            {
              error: err,
            },
            "Error streaming from Dust API"
          );
        });

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

        return ctx.json({ run });
      }

      default:
        assertNever(runFlavor);
    }
  }
);

export default app;
