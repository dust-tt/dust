import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { withLogging } from "@app/logger/withlogging";

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
    res.status(404).end();
    return;
  }

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  switch (req.method) {
    case "GET":
      const config = JSON.parse(req.query.config as string);

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
            res.status(400).json({ ok: false, error: err.error.code });
          } else {
            let models = await modelsRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "cohere":
          let testRes = await fetch("https://api.cohere.ai/tokenize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: "Hello World" }),
          });
          if (!testRes.ok) {
            let err = await testRes.json();
            res.status(400).json({ ok: false, error: err.message });
          } else {
            let test = await testRes.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "ai21":
          let testTokenize = await fetch(
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
            let err = await testTokenize.json();
            res.status(400).json({ ok: false, error: err.message });
          } else {
            let test = await testTokenize.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "azure_openai":
          try {
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
              res.status(400).json({ ok: false, error: err.error.message });
            } else {
              let deployments = await deploymentsRes.json();
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
          let testGenerate = await fetch(
            "https://api.anthropic.com/v1/complete",
            {
              method: "POST",
              headers: {
                "x-api-key": config.api_key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: "👋",
                model: "claude-instant-v1",
                max_tokens_to_sample: 1,
                stop_sequences: [],
              }),
            }
          );

          if (!testGenerate.ok) {
            let err = await testGenerate.json();
            res
              .status(400)
              .json({ ok: false, error: err.message || err.detail });
          } else {
            let test = await testGenerate.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "serpapi":
          let testSearch = await fetch(
            `https://serpapi.com/search?engine=google&q=Coffee&api_key=${config.api_key}`,
            {
              method: "GET",
            }
          );
          if (!testSearch.ok) {
            let err = await testSearch.json();
            res.status(400).json({ ok: false, error: err.error });
          } else {
            let test = await testSearch.json();
            res.status(200).json({ ok: true });
          }
          return;
        case "serper":
          let testSearchSerper = await fetch(
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
            let err = await testSearchSerper.json();
            res.status(400).json({ ok: false, error: err.message });
          } else {
            let test = await testSearchSerper.json();
            res.status(200).json({ ok: true });
          }
          return;

        case "browserlessapi":
          let testScrape = await fetch(
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
            let err = await testScrape.text();
            res.status(400).json({ ok: false, error: err });
          } else {
            let test = await testScrape.json();
            res.status(200).json({ ok: true });
          }
          return;

        default:
          res.status(404).json({ ok: false, error: "Provider not built" });
          return;
      }

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
