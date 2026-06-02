import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { FIREWORKS_DEEPSEEK_R1_MODEL_ID } from "@app/types/assistant/models/fireworks";
import { GEMINI_2_5_PRO_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import {
  TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
  TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
  TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
} from "@app/types/assistant/models/togetherai";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  pId: z.string(),
});

export type GetProviderModelsResponseBody = {
  models: Array<{ id: string }>;
};
export type GetProviderModelsErrorResponseBody = {
  error: string;
};

// Mounted at /api/w/:wId/providers/:pId/models.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (
    ctx
  ): HandlerResult<
    GetProviderModelsResponseBody | GetProviderModelsErrorResponseBody
  > => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { pId } = ctx.req.valid("param");

    const provider = await ProviderModel.findOne({
      where: {
        workspaceId: owner.id,
        providerId: pId,
      },
    });

    if (!provider) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "provider_not_found",
          message:
            "The provider you're trying to list models from was not found.",
        },
      });
    }

    const chat = ctx.req.query("chat") === "true";
    const embed = ctx.req.query("embed") === "true";
    const config = JSON.parse(provider.config);

    switch (pId) {
      case "openai": {
        // eslint-disable-next-line no-restricted-globals
        const modelsRes = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
          },
        });
        if (!modelsRes.ok) {
          const err = await modelsRes.json();
          return ctx.json({ error: err.error }, 400);
        }
        const models = await modelsRes.json();
        const mList = models.data.map((m: any) => ({
          id: m.id as string,
        })) as Array<{ id: string }>;

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
              m.id.startsWith("o1-") ||
              m.id.startsWith("o3-") ||
              m.id.startsWith("o4-")
            );
          });
        }
        f.sort((a, b) => a.id.localeCompare(b.id));
        return ctx.json({ models: f });
      }

      case "azure_openai": {
        // eslint-disable-next-line no-restricted-globals
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
          return ctx.json({ error: err.error }, 400);
        }
        const deployments = await deploymentsRes.json();
        const mList = deployments.data.map((m: any) => ({
          id: m.id,
          model: m.model,
        })) as Array<{ model: string; id: string }>;

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
        f.sort((a, b) => a.id.localeCompare(b.id));
        return ctx.json({
          models: f.map((m) => ({ id: m.id })),
        });
      }

      case "anthropic": {
        let anthropic_models: { id: string }[] = [];
        if (embed) {
          anthropic_models = [];
        } else {
          // From https://docs.anthropic.com/en/docs/about-claude/model-deprecations#model-status.
          anthropic_models = [
            // Deprecated models.
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

        return ctx.json({ models: anthropic_models });
      }

      case "mistral": {
        if (!chat) {
          return ctx.json({ models: [] });
        }
        // eslint-disable-next-line no-restricted-globals
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
          return ctx.json({ error: err.error }, 400);
        }
        const models = await mistralModelRes.json();
        const mList = models.data.map((m: any) => ({
          id: m.id as string,
        })) as Array<{ id: string }>;

        let f = [];
        if (embed) {
          f = mList.filter((m) => m.id === "mistral-embed");
        } else {
          f = mList.filter((m) => !m.id.endsWith("-embed"));
        }
        f.sort((a, b) => a.id.localeCompare(b.id));
        return ctx.json({ models: f });
      }

      case "google_ai_studio":
        return ctx.json({
          models: [{ id: GEMINI_2_5_PRO_MODEL_ID }],
        });

      case "togetherai":
        if (embed) {
          return ctx.json({ models: [] });
        }
        return ctx.json({
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
        return ctx.json({
          models: [
            { id: "llama-v3p1-8b-instruct" },
            { id: FIREWORKS_DEEPSEEK_R1_MODEL_ID },
          ],
        });

      case "deepseek":
        if (embed) {
          return ctx.json({ models: [] });
        }
        return ctx.json({
          models: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
        });

      default:
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "provider_not_found",
            message: "The provider you're trying to check was not found.",
          },
        });
    }
  }
);

export default app;
