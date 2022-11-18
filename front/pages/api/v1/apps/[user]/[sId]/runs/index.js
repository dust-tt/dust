import { User, App, Provider, Key } from "../../../../../../../lib/models";
import { credentialsFromProviders } from "../../../../../../../lib/providers";

const { DUST_API } = process.env;

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

  console.log("SECRET", secret);

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
        message: "You can only run through API apps that you own.",
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

      console.log("API requested app run:", {
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

      const run = await runRes.json();

      res.status(200).json({ run: run.response.run });
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
