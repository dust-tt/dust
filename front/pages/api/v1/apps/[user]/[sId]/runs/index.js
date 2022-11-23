import { User, App, Provider, Key } from "../../../../../../../lib/models";
import { credentialsFromProviders } from "../../../../../../../lib/providers";

const { DUST_API } = process.env;

const poll = async ({
  fn,
  validate,
  interval,
  increment,
  maxInterval,
  maxAttempts,
}) => {
  let attempts = 0;

  const executePoll = async (resolve, reject) => {
    const result = await fn();
    attempts++;
    if (interval < maxInterval) interval += increment;

    if (validate(result)) {
      return resolve(result);
    } else if (maxAttempts && attempts === maxAttempts) {
      return reject(new Error("Exceeded max attempts"));
    } else {
      // console.log("polling again in", interval);
      setTimeout(executePoll, interval, resolve, reject);
    }
  };

  return new Promise(executePoll);
};

export default async function handler(req, res) {
  if (!req.headers.authorization) {
    res.status(401).json({
      error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
    return;
  }

  let parse = req.headers.authorization.match(/Bearer (sk-[a-zA-Z0-9]+)/);
  if (!parse) {
    res.status(401).json({
      error: {
        type: "malformed_authorization_header_error",
        message: "Malformed Authorization header",
      },
    });
    return;
  }
  let secret = parse[1];

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: secret,
      },
    }),
  ]);

  if (!key || key.status !== "active") {
    res.status(401).json({
      error: {
        type: "invalid_api_key_error",
        message: "The API key provided is invalid or disabled.",
      },
    });
    return;
  }

  let [reqUser, appUser] = await Promise.all([
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
    User.findOne({
      where: {
        id: key.userId,
      },
    }),
  ]);

  if (!appUser) {
    res.status(404).json({
      error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found.",
      },
    });
    return;
  }

  if (!reqUser) {
    res.status(500).json({
      error: {
        type: "internal_server_error",
        message: "The user associaed with the api key was not found.",
      },
    });
    return;
  }

  if (appUser.id != reqUser.id) {
    res.status(401).json({
      error: {
        type: "app_user_mismatch_error",
        message:
          "Only apps that you own can be interacted with by API \
          (you can clone this app to run it).",
      },
    });
    return;
  }

  const readOnly = appUser.id !== reqUser.id;

  let [app, providers] = await Promise.all([
    App.findOne({
      where: readOnly
        ? {
            userId: appUser.id,
            sId: req.query.sId,
            visibility: "public",
          }
        : {
            userId: appUser.id,
            sId: req.query.sId,
          },
    }),
    Provider.findAll({
      where: {
        userId: reqUser.id,
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

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.specification_hash == "string") ||
        !(typeof req.body.config == "object" || req.body.config == null) ||
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
        break;
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

      console.log("[API] app run creation:", {
        user: reqUser.username,
        app: app.sId,
        config,
        inputs,
        // credentials,
      });

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
        break;
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
              `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}/status`,
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
          break;
        }

        run = (await runRes.json()).response.run;
        run.specification_hash = run.app_hash;
        delete run.app_hash;
      }

      res.status(200).json({ run });
      break;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
      break;
  }
}
