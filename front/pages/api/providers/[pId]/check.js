import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User } from "../../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  if (!session) {
    res.status(401).end();
    return;
  }

  let user = await User.findOne({
    where: {
      githubId: session.github.id.toString(),
    },
  });

  if (!user) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      const config = JSON.parse(req.query.config);

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
          break;

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
          break;

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
          break;

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
          break;

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
          break;

        default:
          res.status(404).json({ ok: false, error: "Provider not built" });
          break;
      }

    default:
      // Method not allowed
      res.status(405).end();
      break;
  }
}
