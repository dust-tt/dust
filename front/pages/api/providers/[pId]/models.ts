import { auth_user } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { NextApiRequest, NextApiResponse } from "next";

export type GetProviderModelsResponseBody = {
  models: Array<{ id: string }>;
};
export type GetProviderModelsErrorResponseBody = {
  error: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetProviderModelsResponseBody | GetProviderModelsErrorResponseBody
  >
): Promise<void> {
  let authRes = await auth_user(req, res);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (auth.isAnonymous()) {
    res.status(401).end();
    return;
  }

  let [provider] = await Promise.all([
    Provider.findOne({
      where: {
        userId: auth.user().id,
        providerId: req.query.pId,
      },
    }),
  ]);

  if (!provider) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      var chat = req.query.chat === "true" ? true : false;
      var embed = req.query.embed === "true" ? true : false;
      let config = JSON.parse(provider.config);

      switch (req.query.pId) {
        case "openai":
          let modelsRes = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
            },
          });
          if (!modelsRes.ok) {
            let err = await modelsRes.json();
            res.status(400).json({ error: err.error });
          } else {
            let models = await modelsRes.json();
            let mList = models.data.map((m: any) => {
              return { id: m.id as string };
            }) as Array<{ id: string }>;

            let f = [];
            if (embed) {
              f = mList.filter((m) => m.id === "text-embedding-ada-002");
            } else {
              f = mList.filter((m) => {
                return (
                  !(
                    m.id.includes("search") ||
                    m.id.includes("similarity") ||
                    m.id.includes("edit") ||
                    m.id.includes("insert") ||
                    m.id.includes("audio") ||
                    m.id.includes(":") ||
                    m.id.includes("embedding")
                  ) &&
                  (m.id.startsWith("text-") ||
                    m.id.startsWith("code-") ||
                    m.id.startsWith("gpt-3.5-turbo") ||
                    m.id.startsWith("gpt-4")) &&
                  (!chat ||
                    m.id.startsWith("gpt-3.5-turbo") ||
                    m.id.startsWith("gpt-4"))
                );
              });
            }
            f.sort((a, b) => {
              if (a.id < b.id) {
                return -1;
              }
              if (a.id > b.id) {
                return 1;
              }
              return 0;
            });
            res.status(200).json({ models: f });
          }
          return;

        case "cohere":
          let cohereModels = [{ id: "xlarge" }, { id: "medium" }];
          res.status(200).json({ models: cohereModels });
          return;

        case "ai21":
          let ai21Models = [
            { id: "j1-large" },
            { id: "j1-grande" },
            { id: "j1-jumbo" },
          ];
          res.status(200).json({ models: ai21Models });
          return;

        case "azure_openai":
          let deploymentsRes = await fetch(
            `${config.endpoint}openai/deployments?api-version=2022-12-01`,
            {
              method: "GET",
              headers: {
                "api-key": config.api_key,
              },
            }
          );

          if (!deploymentsRes.ok) {
            let err = await deploymentsRes.json();
            res.status(400).json({ error: err.error });
          } else {
            let deployments = await deploymentsRes.json();
            let mList = deployments.data.map((m: any) => {
              return { id: m.id, model: m.model };
            }) as Array<{ model: string; id: string }>;

            let f = [];
            if (embed) {
              f = mList.filter((d) => d.model === "text-embedding-ada-002");
            } else {
              f = mList.filter((d) => {
                return (
                  !(
                    d.model.includes("search") ||
                    d.model.includes("similarity") ||
                    d.model.includes("edit") ||
                    d.model.includes("insert") ||
                    d.model.includes("audio") ||
                    d.model.includes(":") ||
                    d.model.includes("embedding")
                  ) &&
                  (d.model.startsWith("text-") ||
                    d.model.startsWith("code-") ||
                    d.model.startsWith("gpt-3.5-turbo") ||
                    d.model.startsWith("gpt-4")) &&
                  (!chat ||
                    d.model.startsWith("gpt-3.5-turbo") ||
                    d.model.startsWith("gpt-4"))
                );
              });
            }
            f.sort((a, b) => {
              if (a.id < b.id) {
                return -1;
              }
              if (a.id > b.id) {
                return 1;
              }
              return 0;
            });
            res.status(200).json({
              models: f.map((m) => {
                return { id: m.id };
              }),
            });
          }
          return;

        case "anthropic":
          const anthropic_models = [
            { id: "claude-v1" },
            { id: "claude-instant-v1" },
          ];
          res.status(200).json({ models: anthropic_models });
          return;

        default:
          res.status(404).json({ error: "Provider not found" });
          return;
      }

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
