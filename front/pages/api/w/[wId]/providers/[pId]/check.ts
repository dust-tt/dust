import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetProvidersCheckResponseBody =
  | { ok: true }
  | { ok: false; error: string };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProvidersCheckResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can check providers.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const config = req.body.config;

      if (!config) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The config is missing.",
          },
        });
      }

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
            res.status(400).json({ ok: false, error: err.error.code });
          } else {
            await modelsRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "azure_openai":
          try {
            const parsed = new URL(config.endpoint);
            if (
              !parsed.hostname.endsWith(".openai.azure.com") &&
              !parsed.hostname.endsWith(".cognitive.microsoft.com")
            ) {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message:
                    "The endpoint is invalid (expecting `openai.azure.com` or `cognitive.microsoft.com`).",
                },
              });
            }

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
              res.status(400).json({ ok: false, error: err.error.message });
            } else {
              await deploymentsRes.json();
              res.status(200).json({ ok: true });
            }
          } catch (e) {
            // this can happen if config.endpoint is buggy
            res
              .status(400)
              .json({ ok: false, error: "Invalid Azure endpoint URL" });
          }
          return;

        case "anthropic":
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
                model: "claude-3-5-sonnet-20241022",
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
            res
              .status(400)
              .json({ ok: false, error: `[${errType}] ${errMessage}` });
          } else {
            await testCountTokens.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "mistral":
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
            res.status(400).json({
              ok: false,
              error: err.message ? err.message : JSON.stringify(err),
            });
          } else {
            await mistralModelsRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "serpapi":
          const testSearch = await fetch(
            `https://serpapi.com/search?engine=google&q=Coffee&api_key=${config.api_key}`,
            {
              method: "GET",
            }
          );
          if (!testSearch.ok) {
            const err = await testSearch.json();
            res.status(400).json({ ok: false, error: err.error });
          } else {
            await testSearch.json();
            res.status(200).json({ ok: true });
          }
          return;
        case "serper":
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
            res.status(400).json({ ok: false, error: err.message });
          } else {
            await testSearchSerper.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "browserlessapi":
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
            res.status(400).json({ ok: false, error: err });
          } else {
            await testScrape.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "google_ai_studio":
          const { api_key } = config;
          const testUrlGoogleAIStudio = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${api_key}`;
          const testRequestBodyGoogleAIStudio = {
            contents: {
              role: "user",
              parts: {
                text: "Write a story about a magic backpack",
              },
            },
          };
          const rGoogleAIStudio = await fetch(testUrlGoogleAIStudio, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(testRequestBodyGoogleAIStudio),
          });
          if (!rGoogleAIStudio.ok) {
            const err = await rGoogleAIStudio.json();
            return res
              .status(400)
              .json({ ok: false, error: err.error?.message });
          }
          await rGoogleAIStudio.json();
          return res.status(200).json({ ok: true });

        case "togetherai":
          const tModelsRes = await fetch("https://api.together.xyz/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
            },
          });
          if (!tModelsRes.ok) {
            const err = await tModelsRes.json();
            res.status(400).json({ ok: false, error: err.error.message });
          } else {
            await tModelsRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "deepseek":
          const testDeepseek = await fetch(`https://api.deepseek.com/models`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
            },
          });
          if (!testDeepseek.ok) {
            const err = await testDeepseek.json();
            res.status(400).json({ ok: false, error: err.error });
          } else {
            await testDeepseek.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "fireworks":
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
            res.status(400).json({ ok: false, error: err.error });
          } else {
            await testFireworks.json();
            res.status(200).json({ ok: true });
          }
          return;

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
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
