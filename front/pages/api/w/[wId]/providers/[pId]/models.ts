import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetProviderModelsResponseBody = {
  models: Array<{ id: string }>;
};
export type GetProviderModelsErrorResponseBody = {
  error: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      GetProviderModelsResponseBody | GetProviderModelsErrorResponseBody
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "provider_not_found",
        message:
          "The provider you're trying to list models from was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message:
          "Only the users of a workspace can list models from providers.",
      },
    });
  }

  const [provider] = await Promise.all([
    Provider.findOne({
      where: {
        workspaceId: owner.id,
        providerId: req.query.pId,
      },
    }),
  ]);

  if (!provider) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "provider_not_found",
        message:
          "The provider you're trying to list models from was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const chat = req.query.chat === "true" ? true : false;
      const embed = req.query.embed === "true" ? true : false;
      const config = JSON.parse(provider.config);

      switch (req.query.pId) {
        case "openai":
          const modelsRes = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
            },
          });
          if (!modelsRes.ok) {
            const err = await modelsRes.json();
            res.status(400).json({ error: err.error });
          } else {
            const models = await modelsRes.json();
            const mList = models.data.map((m: any) => {
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
          const cohereModels = [
            { id: "command" },
            { id: "command-light" },
            { id: "command-nightly" },
            { id: "command-light-nightly" },
          ];
          res.status(200).json({ models: cohereModels });
          return;

        case "ai21":
          const ai21Models = [
            { id: "j1-large" },
            { id: "j1-grande" },
            { id: "j1-jumbo" },
          ];
          res.status(200).json({ models: ai21Models });
          return;

        case "azure_openai":
          const deploymentsRes = await fetch(
            `${config.endpoint}openai/deployments?api-version=2022-12-01`,
            {
              method: "GET",
              headers: {
                "api-key": config.api_key,
              },
            }
          );

          if (!deploymentsRes.ok) {
            const err = await deploymentsRes.json();
            res.status(400).json({ error: err.error });
          } else {
            const deployments = await deploymentsRes.json();
            const mList = deployments.data.map((m: any) => {
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
          let anthropic_models: { id: string }[] = [];
          if (embed) {
            anthropic_models = [];
          } else {
            if (chat) {
              anthropic_models = [
                { id: "claude-instant-1.2" },
                { id: "claude-2.1" },
                { id: "claude-3-haiku-20240307" },
                { id: "claude-3-sonnet-20240229" },
                { id: "claude-3-opus-20240229" },
              ];
            } else {
              anthropic_models = [
                { id: "claude-instant-1.2" },
                { id: "claude-2.1" },
              ];
            }
          }

          res.status(200).json({ models: anthropic_models });
          return;

        case "mistral":
          if (!chat) {
            res.status(200).json({ models: [] });
            return;
          }
          const mistralModelRes = await fetch(
            "https://api.mistral.ai/v1/models",
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${config.api_key}`,
              },
            }
          );
          if (!mistralModelRes.ok) {
            const err = await mistralModelRes.json();
            res.status(400).json({ error: err.error });
          } else {
            const models = await mistralModelRes.json();
            const mList = models.data.map((m: any) => {
              return { id: m.id as string };
            }) as Array<{ id: string }>;

            let f = [];
            if (embed) {
              f = mList.filter((m) => m.id === "mistral-embed");
            } else {
              f = mList.filter(
                (m) => m.id.startsWith("mistral-") && !m.id.endsWith("-embed")
              );
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

        case "google_vertex_ai":
          return res.status(200).json({
            models: [{ id: "gemini-pro" }],
          });

        default:
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "provider_not_found",
              message: "The provider you're trying to check was not found.",
            },
          });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
