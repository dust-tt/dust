import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { User, Provider } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";

async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  if (!session) {
    res.status(401).end();
    return;
  }

  let user = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });

  if (!user) {
    res.status(401).end();
    return;
  }

  let [provider] = await Promise.all([
    Provider.findOne({
      where: {
        userId: user.id,
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
            let f = [];
            if (embed) {
              f = models.data.filter((m) => m.id === "text-embedding-ada-002");
            } else {
              f = models.data.filter((m) => {
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
          break;

        case "cohere":
          let cohereModels = [{ id: "xlarge" }, { id: "medium" }];
          res.status(200).json({ models: cohereModels });
          break;

        case "ai21":
          let ai21Models = [
            { id: "j1-large" },
            { id: "j1-grande" },
            { id: "j1-jumbo" },
          ];
          res.status(200).json({ models: ai21Models });
          break;

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
            let f = [];
            if (embed) {
              f = deployments.data.filter(
                (d) => d.model === "text-embedding-ada-002"
              );
            } else {
              f = deployments.data.filter((d) => {
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
            res.status(200).json({ models: f });
          }
          break;

        default:
          res.status(404).json({ ok: false, error: "Provider not found" });
          break;
      }

    default:
      // Method not allowed
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
