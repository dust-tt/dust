import type { GetProvidersCheckResponseBody } from "@app/types/api/provider_credentials";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostCheckBodySchema = z.object({
  config: z.object({
    api_key: z.string(),
    endpoint: z.string().optional(),
  }),
});

const ParamsSchema = z.object({
  pId: z.string(),
});

// Mounted at /api/w/:wId/providers/:pId/check.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  ensureIsBuilder(),
  validate("json", PostCheckBodySchema),
  async (ctx): HandlerResult<GetProvidersCheckResponseBody> => {
    const { pId } = ctx.req.valid("param");
    const { config } = ctx.req.valid("json");

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
          return ctx.json({ ok: false, error: err.error.code }, 400);
        }
        await modelsRes.json();
        return ctx.json({ ok: true });
      }

      case "azure_openai": {
        if (!config.endpoint) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The endpoint is required for Azure OpenAI.",
            },
          });
        }
        try {
          const parsed = new URL(config.endpoint);
          if (
            !parsed.hostname.endsWith(".openai.azure.com") &&
            !parsed.hostname.endsWith(".cognitive.microsoft.com")
          ) {
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The endpoint is invalid (expecting `openai.azure.com` or `cognitive.microsoft.com`).",
              },
            });
          }

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
            return ctx.json({ ok: false, error: err.error.message }, 400);
          }
          await deploymentsRes.json();
          return ctx.json({ ok: true });
          // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
        } catch (e) {
          return ctx.json(
            { ok: false, error: "Invalid Azure endpoint URL" },
            400
          );
        }
      }

      case "anthropic": {
        // eslint-disable-next-line no-restricted-globals
        const testCountTokens = await fetch(
          "https://api.anthropic.com/v1/messages/count_tokens",
          {
            method: "POST",
            headers: {
              "x-api-key": config.api_key,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "token-counting-2024-11-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              system: "You are a scientist",
              messages: [
                {
                  role: "user",
                  content: "Hello, Claude",
                },
              ],
            }),
          }
        );

        if (!testCountTokens.ok) {
          const errRes = await testCountTokens.json();
          const errType = errRes.error?.type ?? "unknown error";
          const errMessage =
            errRes.error?.message ?? "contact us at support@dust.tt";
          return ctx.json(
            { ok: false, error: `[${errType}] ${errMessage}` },
            400
          );
        }
        await testCountTokens.json();
        return ctx.json({ ok: true });
      }

      case "mistral": {
        // eslint-disable-next-line no-restricted-globals
        const mistralModelsRes = await fetch(
          "https://api.mistral.ai/v1/models",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
            },
          }
        );
        if (!mistralModelsRes.ok) {
          const err = await mistralModelsRes.json();
          return ctx.json(
            {
              ok: false,
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              error: err.message ? err.message : JSON.stringify(err),
            },
            400
          );
        }
        await mistralModelsRes.json();
        return ctx.json({ ok: true });
      }

      case "serpapi": {
        // eslint-disable-next-line no-restricted-globals
        const testSearch = await fetch(
          `https://serpapi.com/search?engine=google&q=Coffee&api_key=${config.api_key}`,
          {
            method: "GET",
          }
        );
        if (!testSearch.ok) {
          const err = await testSearch.json();
          return ctx.json({ ok: false, error: err.error }, 400);
        }
        await testSearch.json();
        return ctx.json({ ok: true });
      }

      case "serper": {
        // eslint-disable-next-line no-restricted-globals
        const testSearchSerper = await fetch(
          `https://google.serper.dev/search`,
          {
            method: "POST",
            headers: {
              "X-API-KEY": config.api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: "Coffee",
            }),
          }
        );
        if (!testSearchSerper.ok) {
          const err = await testSearchSerper.json();
          return ctx.json({ ok: false, error: err.message }, 400);
        }
        await testSearchSerper.json();
        return ctx.json({ ok: true });
      }

      case "browserlessapi": {
        // eslint-disable-next-line no-restricted-globals
        const testScrape = await fetch(
          `https://chrome.browserless.io/scrape?token=${config.api_key}`,
          {
            method: "POST",
            headers: {
              "Cache-Control": "no-cache",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: "https://example.com/",
              elements: [{ selector: "body" }],
            }),
          }
        );
        if (!testScrape.ok) {
          // Browserless API returns errors just as plain text, not as JSON.
          const err = await testScrape.text();
          return ctx.json({ ok: false, error: err }, 400);
        }
        await testScrape.json();
        return ctx.json({ ok: true });
      }

      case "google_ai_studio": {
        const { api_key } = config;
        const testUrlGoogleAIStudio = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${api_key}`;
        const testRequestBodyGoogleAIStudio = {
          contents: {
            role: "user",
            parts: {
              text: "Write a story about a magic backpack",
            },
          },
        };
        // eslint-disable-next-line no-restricted-globals
        const rGoogleAIStudio = await fetch(testUrlGoogleAIStudio, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(testRequestBodyGoogleAIStudio),
        });
        if (!rGoogleAIStudio.ok) {
          const err = await rGoogleAIStudio.json();
          return ctx.json({ ok: false, error: err.error?.message }, 400);
        }
        await rGoogleAIStudio.json();
        return ctx.json({ ok: true });
      }

      case "togetherai": {
        // eslint-disable-next-line no-restricted-globals
        const tModelsRes = await fetch("https://api.together.xyz/v1/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
          },
        });
        if (!tModelsRes.ok) {
          const err = await tModelsRes.json();
          return ctx.json({ ok: false, error: err.error.message }, 400);
        }
        await tModelsRes.json();
        return ctx.json({ ok: true });
      }

      case "deepseek": {
        // eslint-disable-next-line no-restricted-globals
        const testDeepseek = await fetch(`https://api.deepseek.com/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
          },
        });
        if (!testDeepseek.ok) {
          const err = await testDeepseek.json();
          return ctx.json({ ok: false, error: err.error }, 400);
        }
        await testDeepseek.json();
        return ctx.json({ ok: true });
      }

      case "fireworks": {
        // eslint-disable-next-line no-restricted-globals
        const testFireworks = await fetch(
          `https://api.fireworks.ai/inference/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
              messages: [{ role: "user", content: "Hello, Fireworks" }],
            }),
          }
        );
        if (!testFireworks.ok) {
          const err = await testFireworks.json();
          return ctx.json({ ok: false, error: err.error }, 400);
        }
        await testFireworks.json();
        return ctx.json({ ok: true });
      }

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
