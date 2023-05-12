import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import {
  credentialsFromProviders,
  dustManagedCredentials,
} from "@app/lib/api/credentials";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Provider, Run } from "@app/lib/models";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { CredentialsType } from "@app/types/provider";
import { RunType } from "@app/types/run";

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
    if (interval < maxInterval) interval += increment;

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostRunResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

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

  let [app, providers] = await Promise.all([
    getApp(auth, req.query.aId as string),
    Provider.findAll({
      where: {
        workspaceId: keyRes.value.workspaceId,
      },
    }),
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

      let config = req.body.config;
      let inputs = req.body.inputs;
      let specificationHash = req.body.specification_hash;

      for (const name in config) {
        const c = config[name];
        if (c.type == "input") {
          delete c.dataset;
        }
      }

      let credentials: CredentialsType | null = null;
      if (keyRes.value.isSystem) {
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
        const runRes = await CoreAPI.createRunStream(
          app.dustAPIProjectId,
          owner,
          {
            runType: "deploy",
            specificationHash: specificationHash,
            config: { blocks: config },
            inputs,
            credentials,
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
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        try {
          for await (const chunk of runRes.value.chunkStream) {
            res.write(chunk);
            // @ts-expect-error
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

        await Run.create({
          dustRunId,
          appId: app.id,
          runType: "deploy",
          workspaceId: keyRes.value.workspaceId,
        });

        return;
      }

      const runRes = await CoreAPI.createRun(app.dustAPIProjectId, owner, {
        runType: "deploy",
        specificationHash: specificationHash,
        config: { blocks: config },
        inputs,
        credentials,
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

      await Run.create({
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
        let runId = run.run_id;
        try {
          await poll({
            fn: async () => {
              const run = await CoreAPI.getRunStatus(
                app!.dustAPIProjectId,
                runId
              );
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
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "run_error",
              message: `There was an error polling the run status: runId=${runId} error=${e}`,
            },
          });
        }

        // Finally refresh the run object.
        const runRes = await CoreAPI.getRun(app!.dustAPIProjectId, runId);
        if (runRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "run_error",
              message: "There was an error retrieving the run while polling.",
              run_error: runRes.error,
            },
          });
        }
        run = runRes.value.run;
        run.specification_hash = run.app_hash;
        delete run.app_hash;
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
