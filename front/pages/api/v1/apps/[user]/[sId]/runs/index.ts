import { User, App, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import logger from "@app/logger/logger";
import { NextApiRequest, NextApiResponse } from "next";
import { auth_api_user } from "@app/lib/api/auth";
import { streamChunks } from "@app/lib/http_utils";
import withLogging from "@app/logger/withlogging";
import { RunType } from "@app/types/run";
import { APIError } from "@app/lib/api/error";

const { DUST_API } = process.env;

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
    const result = await fn();
    attempts++;
    if (interval < maxInterval) interval += increment;

    if (validate(result)) {
      return resolve(result);
    } else if (maxAttempts && attempts === maxAttempts) {
      return reject(new Error("Exceeded max attempts"));
    } else {
      setTimeout(executePoll, interval, resolve, reject);
    }
  };

  return new Promise(executePoll);
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostRunResponseBody | APIError>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error();
    return res.status(err.status_code).json(err.api_error);
  }
  const auth = authRes.value();

  if (!appUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  let [app, providers] = await Promise.all([
    App.findOne({
      where: {
        userId: appUser.id,
        sId: req.query.sId,
      },
    }),
    Provider.findAll({
      where: {
        userId: auth.user().id,
      },
    }),
  ]);

  if (!app) {
    res.status(404).json({
      error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
    return;
  }

  if (!auth.canRunApp(app)) {
    res.status(404).json({
      error: {
        type: "app_user_mismatch_error",
        message:
          "Only apps that you own can be interacted with by API \
          (you can clone this app to run it).",
      },
    });
    return;
  }

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.specification_hash === "string") ||
        !(typeof req.body.config === "object" && req.body.config !== null) ||
        !Array.isArray(req.body.inputs)
      ) {
        res.status(400).json({
          error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, \
              `specification_hash` (string), `config` (object), and `inputs` (array) are required.",
          },
        });
        return;
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

      let credentials = credentialsFromProviders(providers);

      logger.info(
        {
          user: appUser.username,
          app: app.sId,
        },
        "App run creation"
      );

      // If `stream` is true, run in streaming mode.
      if (req.body.stream) {
        const runRes = await fetch(
          `${DUST_API}/projects/${app.dustAPIProjectId}/runs/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Dust-User-Id": auth.user().id.toString(),
            },
            body: JSON.stringify({
              run_type: "deploy",
              specification_hash: specificationHash,
              inputs,
              config: { blocks: config },
              credentials,
            }),
          }
        );

        if (!runRes.ok) {
          const error = await runRes.json();
          res.status(400).json({
            error: {
              type: "run_error",
              message: "There was an error running the app.",
              run_error: error.error,
            },
          });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        try {
          for await (const chunk of streamChunks(runRes.body!)) {
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
        return;
      }

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Dust-User-Id": auth.user().id.toString(),
          },
          body: JSON.stringify({
            run_type: "deploy",
            specification_hash: specificationHash,
            inputs,
            config: { blocks: config },
            credentials,
          }),
        }
      );

      if (!runRes.ok) {
        const error = await runRes.json();
        res.status(400).json({
          error: {
            type: "run_error",
            message: "There was an error running the app.",
            run_error: error.error,
          },
        });
        return;
      }

      let run = (await runRes.json()).response.run;
      run.specification_hash = run.app_hash;
      delete run.app_hash;

      // If `blocking` is set, poll for run completion.
      if (req.body.blocking) {
        let runId = run.run_id;
        await poll({
          fn: async () => {
            const runRes = await fetch(
              `${DUST_API}/projects/${
                app!.dustAPIProjectId
              }/runs/${runId}/status`,
              {
                method: "GET",
              }
            );
            if (!runRes.ok) {
              const error = await runRes.json();
              return { status: "error" };
            }
            const r = (await runRes.json()).response.run;
            return { status: r.status.run };
          },
          validate: (r) => {
            if (r.status == "running") {
              return false;
            }
            return true;
          },
          interval: 128,
          increment: 32,
          maxInterval: 1024,
          maxAttempts: 64,
        });

        // Finally refresh the run object.
        const runRes = await fetch(
          `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}`,
          {
            method: "GET",
          }
        );

        if (!runRes.ok) {
          const error = await runRes.json();
          res.status(400).json({
            error: {
              type: "run_error",
              message: "There was an error retrieving the run while polling.",
              run_error: error.error,
            },
          });
          return;
        }

        run = (await runRes.json()).response.run;
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

      res.status(200).json({ run });
      return;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
