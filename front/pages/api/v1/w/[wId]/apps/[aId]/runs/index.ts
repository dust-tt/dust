import type {
  AppType,
  CoreAPIError,
  CredentialsType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import {
  credentialsFromProviders,
  dustManagedCredentials,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { createParser } from "eventsource-parser";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { getDustAppSecrets } from "@app/lib/api/dust_app_secrets";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { Provider, Run, RunUsage } from "@app/lib/models/apps";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostRunResponseBody = {
  run: RunType;
};

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

interface PoolCall {
  fn: () => Promise<any>;
  validate: (result: any) => boolean;
  interval: number;
  increment: number;
  maxInterval: number;
  maxAttempts: number;
}

type Usage = {
  providerId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
};

const poll = async ({
  fn,
  validate,
  interval,
  increment,
  maxInterval,
  maxAttempts,
}: PoolCall) => {
  let attempts = 0;

  const executePoll = async (resolve: any, reject: any) => {
    let result = null;
    try {
      result = await fn();
    } catch (e) {
      logger.error(
        {
          error: e,
        },
        "Caught error in executePoll"
      );
      return reject(e);
    }
    attempts++;
    if (interval < maxInterval) {
      interval += increment;
    }

    if (validate(result)) {
      return resolve(result);
    } else if (maxAttempts && attempts === maxAttempts) {
      return reject(
        new Error(
          "The run took too long to complete, retry with `blocking=false` and direct polling of the runId"
        )
      );
    } else {
      setTimeout(executePoll, interval, resolve, reject);
    }
  };

  return new Promise(executePoll);
};

async function pollForRunCompletion(
  coreAPI: CoreAPI,
  app: AppType,
  runId: string
) {
  try {
    await poll({
      fn: async () => {
        const run = await coreAPI.getRunStatus({
          projectId: app.dustAPIProjectId,
          runId,
        });
        if (run.isErr()) {
          return { status: "error" };
        }
        const r = run.value.run;
        return { status: r.status.run };
      },
      validate: (r) => {
        if (r && r.status == "running") {
          return false;
        }
        return true;
      },
      interval: 128,
      increment: 32,
      maxInterval: 1024,
      maxAttempts: 64,
    });
  } catch (e) {
    throw Error(
      `There was an error polling the run status: runId=${runId} error=${e}`
    );
  }

  // Finally refresh the run object.
  const runRes = await coreAPI.getRun({
    projectId: app.dustAPIProjectId,
    runId,
  });
  if (runRes.isErr()) {
    throw Error(`There was an error retrieving the run while polling.`, {
      cause: runRes.error,
    });
  }
  const run = runRes.value.run;
  run.specification_hash = run.app_hash;
  delete run.app_hash;
  return run;
}

function extractUsageFromExecutions(
  block: { provider_id: string; model_id: string },
  executions: {
    meta?: {
      token_usage?: { prompt_tokens: number; completion_tokens: number };
    };
  }[][],
  usages: Usage[]
) {
  if (block) {
    executions.forEach((executionsInner) => {
      executionsInner.forEach((execution) => {
        if (execution?.meta?.token_usage) {
          const promptTokens = execution?.meta?.token_usage.prompt_tokens;
          const completionTokens =
            execution?.meta?.token_usage.completion_tokens;
          usages.push({
            providerId: block.provider_id,
            modelId: block.model_id,
            promptTokens,
            completionTokens,
          });
        }
      });
    });
  }
}

function storeTokenUsages(run: RunType, runId: number) {
  const usages: Usage[] = [];
  run.traces.forEach((trace: any) => {
    const block = run.config.blocks[trace[0][1]];
    extractUsageFromExecutions(block, trace[1], usages);
  });

  return RunUsage.bulkCreate(
    usages.map((usage) => ({
      runId,
      ...usage,
    }))
  );
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostRunResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  const [app, providers, secrets] = await Promise.all([
    getApp(auth, req.query.aId as string),
    Provider.findAll({
      where: {
        workspaceId: keyRes.value.workspaceId,
      },
    }),
    getDustAppSecrets(auth, true),
  ]);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  // This variable is used in the context of the DustAppRun action to use the workspace credentials
  // instead of our managed credentials when running an app with a system API key.
  const useWorkspaceCredentials = !!req.query["use_workspace_credentials"];
  const coreAPI = new CoreAPI(logger);

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
      if (keyRes.value.isSystem && !useWorkspaceCredentials) {
        // Dust managed credentials: system API key (packaged apps).
        credentials = dustManagedCredentials();
      } else {
        credentials = credentialsFromProviders(providers);
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

      // If `stream` is true, run in streaming mode.
      if (req.body.stream) {
        const runRes = await coreAPI.createRunStream({
          projectId: app.dustAPIProjectId,
          runAsWorkspaceId: keyWorkspaceId,
          runType: "deploy",
          specificationHash: specificationHash,
          config: { blocks: config },
          inputs,
          credentials,
          secrets,
        });

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
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const usages: Usage[] = [];

        try {
          // Intercept block_execution events to store token usages.
          const parser = createParser((event) => {
            if (event.type === "event") {
              if (event.data) {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === "block_execution") {
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
            res.write(chunk);
            // @ts-expect-error we need to flush for streaming but TS thinks flush() does not exists.
            res.flush();
          }
        } catch (err) {
          logger.error(
            {
              error: err,
            },
            "Error streaming from Dust API"
          );
        }
        res.end();

        let dustRunId: string;
        try {
          dustRunId = await runRes.value.dustRunId;
        } catch (e) {
          logger.error(
            {
              error: "No run ID received from Dust API after consuming stream",
            },
            "Error streaming from Dust API"
          );
          return;
        }

        const runEntity = await Run.create({
          dustRunId,
          appId: app.id,
          runType: "deploy",
          workspaceId: keyRes.value.workspaceId,
        });

        await RunUsage.bulkCreate(
          usages.map((usage) => ({
            runId: runEntity.id,
            ...usage,
          }))
        );

        return;
      }

      const runRes = await coreAPI.createRun({
        projectId: app.dustAPIProjectId,
        runAsWorkspaceId: keyWorkspaceId,
        runType: "deploy",
        specificationHash: specificationHash,
        config: { blocks: config },
        inputs,
        credentials,
        secrets,
      });

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

      const runEntity = await Run.create({
        dustRunId: runRes.value.run.run_id,
        appId: app.id,
        runType: "deploy",
        workspaceId: keyRes.value.workspaceId,
      });

      let run: RunType = runRes.value.run;
      run.specification_hash = run.app_hash;
      delete run.app_hash;

      // If `blocking` is set, poll for run completion.
      if (req.body.blocking) {
        const runId = run.run_id;
        try {
          run = await pollForRunCompletion(coreAPI, app, runId);
          await storeTokenUsages(run, runEntity.id);
        } catch (e) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "run_error",
              message:
                e instanceof Error
                  ? e.message
                  : `There was an error polling the run status: runId=${runId} error=${e}`,
              run_error:
                e instanceof Error ? (e.cause as CoreAPIError) : undefined,
            },
          });
        }
      } else {
        const runId = run.run_id;
        try {
          void (async () => {
            // Non-blocking, store token usages asynchronously
            const run = await pollForRunCompletion(coreAPI, app, runId);
            await storeTokenUsages(run, runEntity.id);
          })();
        } catch (e) {
          logger.error(
            {
              error: e,
            },
            `There was an error polling the run status: runId=${runId} error=${e}`
          );
        }
      }

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

export default withLogging(handler);
