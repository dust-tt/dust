/* eslint jsdoc/no-missing-syntax: 0 */ //
// Disabling jsdoc rule, as we're not yet documentating dust apps endpoints under vaults.
// We still document the legacy endpoint, which does the same thing.
// Note: for now, an API key only has access to the global vault.
import type {
  BlockType,
  CredentialsType,
  ModelIdType,
  ModelProviderIdType,
  TraceType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import {
  assertNever,
  credentialsFromProviders,
  dustManagedCredentials,
  rateLimiter,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { createParser } from "eventsource-parser";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type PostRunResponseBody = {
  run: RunType;
};

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

type RunFlavor = "blocking" | "streaming" | "non-blocking";

type Trace = [[BlockType, string], TraceType[][]];

function extractUsageFromExecutions(
  block: { provider_id: ModelProviderIdType; model_id: ModelIdType },
  traces: TraceType[][],
  usages: RunUsageType[]
) {
  if (block) {
    traces.forEach((tracesInner) => {
      tracesInner.forEach((trace) => {
        if (trace?.meta) {
          const { token_usage } = trace.meta as {
            token_usage: { prompt_tokens: number; completion_tokens: number };
          };
          if (token_usage) {
            const promptTokens = token_usage.prompt_tokens;
            const completionTokens = token_usage.completion_tokens;
            usages.push({
              providerId: block.provider_id,
              modelId: block.model_id,
              promptTokens,
              completionTokens,
            });
          }
        }
      });
    });
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostRunResponseBody>>,
  auth: Authenticator,
  keyAuth: Authenticator
): Promise<void> {
  const keyWorkspaceId = keyAuth.getNonNullableWorkspace().id;

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  let vaultId = req.query.vId;
  // Handling the case where vId is undefined to keep support
  // for the legacy endpoint (not under vault, global vault assumed).
  if (vaultId === undefined) {
    const globalVault = await VaultResource.fetchWorkspaceGlobalVault(keyAuth);
    vaultId = globalVault.sId;
  }

  const [app, providers, secrets] = await Promise.all([
    AppResource.fetchById(auth, req.query.aId as string),
    Provider.findAll({
      where: {
        workspaceId: keyWorkspaceId,
      },
    }),
    getDustAppSecrets(auth, true),
  ]);

  if (!app || app.vault.sId !== vaultId) {
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
        message: "Running an app requires read access to the app's vault.",
      },
    });
  }

  // This variable is used in the context of the DustAppRun action to use the workspace credentials
  // instead of our managed credentials when running an app with a system API key.
  const useWorkspaceCredentials = !!req.query["use_workspace_credentials"];
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

      let credentials: CredentialsType | null = null;
      if (auth.isSystemKey() && !useWorkspaceCredentials) {
        // Dust managed credentials: system API key (packaged apps).
        credentials = dustManagedCredentials();
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

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
          app: app.sId,
        },
        "App run creation"
      );

      const runRes = await coreAPI.createRunStream(
        keyAuth.getNonNullableWorkspace(),
        keyAuth.groups(),
        {
          projectId: app.dustAPIProjectId,
          runType: "deploy",
          specificationHash: specificationHash,
          config: { blocks: config },
          inputs,
          credentials,
          secrets,
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
                  extractUsageFromExecutions(
                    block,
                    data.content.execution,
                    usages
                  );
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

      const dustRunId = await runRes.value.dustRunId;

      const run = await RunResource.makeNew({
        dustRunId,
        appId: app.id,
        runType: "deploy",
        workspaceId: keyWorkspaceId,
      });

      await run.recordRunUsage(usages);

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

export default withPublicAPIAuthentication(handler, {
  allowUserOutsideCurrentWorkspace: true,
});
