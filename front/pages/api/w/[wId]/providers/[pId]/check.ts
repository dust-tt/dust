import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetProvidersCheckResponseBody =
  | { ok: true }
  | { ok: false; error: string };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetProvidersCheckResponseBody>
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
    case "GET":
      const config = JSON.parse(req.query.config as string);

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

        case "textsynth":
          const testCompletion = await fetch(
            "https://api.textsynth.com/v1/engines/mistral_7B/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.api_key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: "<html>",
                max_tokens: 1,
              }),
            }
          );

          if (!testCompletion.ok) {
            const err = await testCompletion.json();
            res.status(400).json({ ok: false, error: err.error });
          } else {
            await testCompletion.json();
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
      break;
  }
}

export default withLogging(handler);
