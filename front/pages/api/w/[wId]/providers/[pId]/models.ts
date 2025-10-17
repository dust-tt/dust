import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import {
  FIREWORKS_DEEPSEEK_R1_MODEL_ID,
  GEMINI_1_5_FLASH_LATEST_MODEL_ID,
  GEMINI_1_5_PRO_LATEST_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID,
  GEMINI_2_FLASH_MODEL_ID,
  GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID,
  GEMINI_2_PRO_PREVIEW_MODEL_ID,
  TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
} from "@app/types";

export type GetProviderModelsResponseBody = {
  models: Array<{ id: string }>;
};
export type GetProviderModelsErrorResponseBody = {
  error: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProviderModelsResponseBody | GetProviderModelsErrorResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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
              f = mList.filter((m) => m.id.startsWith("text-embedding"));
            } else {
              f = mList.filter((m) => {
                if (
                  m.id.includes("search") ||
                  m.id.includes("similarity") ||
                  m.id.includes("edit") ||
                  m.id.includes("insert") ||
                  m.id.includes("audio") ||
                  m.id.includes(":") ||
                  m.id.includes("embedding")
                ) {
                  return false;
                }

                return (
                  m.id.startsWith("text-") ||
                  m.id.startsWith("code-") ||
                  m.id.startsWith("gpt-3.5-turbo") ||
                  m.id.startsWith("gpt-4") ||
                  m.id.startsWith("gpt-5") ||
                  m.id.startsWith("o1-") ||
                  m.id.startsWith("o3-") ||
                  m.id.startsWith("o4-")
                );
              });
            }
            // Prioritize newer GPT families (gpt-5 before gpt-4) while keeping
            // a stable alphabetical order within the same family.
            const rank = (id: string) =>
              id.startsWith("gpt-5")
                ? 0
                : id.startsWith("gpt-4")
                ? 1
                : id.startsWith("gpt-3.5")
                ? 2
                : 3;
            f.sort((a, b) => {
              const ra = rank(a.id);
              const rb = rank(b.id);
              if (ra !== rb) {
                return ra - rb;
              }
              return a.id.localeCompare(b.id);
            });
            res.status(200).json({ models: f });
          }
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
              f = mList.filter((m) => m.model.startsWith("text-embedding"));
            } else {
              f = mList.filter((m) => {
                if (
                  m.id.includes("search") ||
                  m.id.includes("similarity") ||
                  m.id.includes("edit") ||
                  m.id.includes("insert") ||
                  m.id.includes("audio") ||
                  m.id.includes(":") ||
                  m.id.includes("embedding")
                ) {
                  return false;
                }

                return (
                  m.id.startsWith("text-") ||
                  m.id.startsWith("code-") ||
                  m.id.startsWith("gpt-3.5-turbo") ||
                  m.id.startsWith("gpt-4") ||
                  m.id.startsWith("gpt-5") ||
                  m.id.startsWith("o1-") ||
                  m.id.startsWith("o3-") ||
                  m.id.startsWith("o4-")
                );
              });
            }
            // For Azure, use the underlying model name to rank families when available
            // so gpt-5 deployments appear before gpt-4, then fall back to id.
            const arank = (m: { id: string; model?: string }) => {
              const key = m.model ?? m.id;
              return key.startsWith("gpt-5")
                ? 0
                : key.startsWith("gpt-4")
                ? 1
                : key.startsWith("gpt-3.5")
                ? 2
                : 3;
            };
            f.sort((a, b) => {
              const ra = arank(a);
              const rb = arank(b);
              if (ra !== rb) {
                return ra - rb;
              }
              // Stable fallback by id to preserve predictability
              return a.id.localeCompare(b.id);
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
            // From https://docs.anthropic.com/en/docs/about-claude/model-deprecations#model-status.
            anthropic_models = [
              // Deprecated models.
              { id: "claude-2.1" }, // Retired Jul 2025.
              { id: "claude-3-sonnet-20240229" }, // Retired Jul 2025.
              { id: "claude-3-5-sonnet-20240620" }, // Retired Oct 2025.
              { id: "claude-3-5-sonnet-20241022" }, // Retired Oct 2025.
              { id: "claude-3-opus-20240229" }, // Retired Jan 2026.
              { id: "claude-3-7-sonnet-20250219" }, // Retired Feb 2026.
              // Active models.
              { id: "claude-3-5-haiku-20241022" },
              { id: "claude-3-haiku-20240307" },
              { id: "claude-4-sonnet-20250514" },
              { id: "claude-haiku-4-5-20251001" },
              { id: "claude-opus-4-20250514" },
              { id: "claude-sonnet-4-5-20250929" },
            ];
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
              f = mList.filter((m) => !m.id.endsWith("-embed"));
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

        case "google_ai_studio":
          return res.status(200).json({
            models: [
              { id: GEMINI_1_5_FLASH_LATEST_MODEL_ID },
              { id: GEMINI_1_5_PRO_LATEST_MODEL_ID },
              { id: GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID },
              { id: GEMINI_2_FLASH_MODEL_ID },
              { id: GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID },
              { id: GEMINI_2_PRO_PREVIEW_MODEL_ID },
              { id: GEMINI_2_5_PRO_MODEL_ID },
            ],
          });

        case "togetherai":
          if (embed) {
            res.status(200).json({ models: [] });
            return;
          }
          return res.status(200).json({
            models: [
              // llama
              { id: TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID },
              // qwen
              { id: TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID },
              { id: TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID },
              { id: TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID },
              // deepseek
              { id: TOGETHERAI_DEEPSEEK_V3_MODEL_ID },
              { id: TOGETHERAI_DEEPSEEK_R1_MODEL_ID },
            ],
          });
        case "fireworks":
          return res.status(200).json({
            models: [
              { id: "llama-v3p1-8b-instruct" },
              { id: FIREWORKS_DEEPSEEK_R1_MODEL_ID },
            ],
          });
        case "deepseek":
          if (embed) {
            res.status(200).json({ models: [] });
            return;
          }
          return res.status(200).json({
            models: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
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

export default withSessionAuthenticationForWorkspace(handler);
