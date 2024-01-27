import type { WithAPIErrorReponse } from "@dust-tt/types";
import { GoogleAuth } from "google-auth-library";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetProvidersCheckResponseBody =
  | { ok: true }
  | { ok: false; error: string };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetProvidersCheckResponseBody>>
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
        message: "The provider you're trying to update was not found.",
      },
    });
  }

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

        case "cohere":
          const testRes = await fetch("https://api.cohere.ai/tokenize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: "Hello World" }),
          });
          if (!testRes.ok) {
            const err = await testRes.json();
            res.status(400).json({ ok: false, error: err.message });
          } else {
            await testRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "ai21":
          const testTokenize = await fetch(
            "https://api.ai21.com/studio/v1/tokenize",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.api_key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text: "Hello World" }),
            }
          );
          if (!testTokenize.ok) {
            const err = await testTokenize.json();
            res.status(400).json({ ok: false, error: err.message });
          } else {
            await testTokenize.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "azure_openai":
          try {
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
          const testGenerate = await fetch(
            "https://api.anthropic.com/v1/complete",
            {
              method: "POST",
              headers: {
                "x-api-key": config.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: "\n\nHuman: 👋\n\nAssistant:",
                model: "claude-instant-1.2",
                max_tokens_to_sample: 1,
                stop_sequences: [],
              }),
            }
          );

          if (!testGenerate.ok) {
            const err = await testGenerate.json();
            res
              .status(400)
              .json({ ok: false, error: err.message || err.detail });
          } else {
            await testGenerate.json();
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

        case "google_vertex_ai":
          const { service_account: serviceAccountJson, endpoint } = config;
          if (!serviceAccountJson) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "The service account is missing.",
              },
            });
          }
          if (!endpoint) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "The endpoint is missing.",
              },
            });
          }

          const serviceAccount = JSON.parse(serviceAccountJson);

          const auth = new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            credentials: {
              client_email: serviceAccount.client_email,
              private_key: serviceAccount.private_key,
            },
          });
          const client = await auth.getClient();
          const accessToken = await client.getAccessToken();
          const testUrl = `${endpoint}/publishers/google/models/gemini-pro:streamGenerateContent`;
          const testRequestBody = {
            contents: {
              role: "user",
              parts: {
                text: "Another one bites the ...",
              },
            },
            generation_config: {
              temperature: 0.5,
              maxOutputTokens: 1,
            },
          };
          const r = await fetch(testUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(testRequestBody),
          });
          if (!r.ok) {
            const err = await r.json();
            return res.status(400).json({ ok: false, error: err.error });
          }
          await r.json();
          return res.status(200).json({ ok: true });

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

export default withLogging(handler);
