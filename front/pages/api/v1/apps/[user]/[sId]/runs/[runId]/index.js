import { User, App, Provider, Key } from "../../../../../../../../lib/models";

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
        message: "The app whose run you're trying to retrieve was not found.",
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
        message: "The app whose run you're trying to retrieve was not found.",
      },
    });
    return;
  }

  switch (req.method) {
    case "GET":
      let runId = req.query.runId;

      console.log("[API] app run retrieve:", {
        user: reqUser.username,
        app: app.sId,
        runId,
      });

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
            message: "There was an error retrieving the run.",
            run_error: error.error,
          },
        });
        break;
      }

      let run = (await runRes.json()).response.run;
      run.specification_hash = run.app_hash;
      delete run.app_hash;

      res.status(200).json({ run });
      break;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      break;
  }
}
