import express from "express";

const app = express();
app.use(express.json());

async function forwardToRegions(
  webhookSecret: string,
  endpoint: string,
  method: string,
  body: unknown
) {
  const targetPath = `/webhooks/${webhookSecret}/${endpoint}`;

  const requests = [
    fetch(`https://connectors.dust.tt${targetPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    fetch(`https://eu.connectors.dust.tt${targetPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ];

  const results = await Promise.allSettled(requests);
  console.log(
    `Forwarded ${endpoint} to regions:`,
    results.map((r) => r.status)
  );
}

app.post("/:webhookSecret/events", async (req, res) => {
  const { webhookSecret } = req.params;

  try {
    // Handle Slack URL verification challenge.
    if (req.body.type === "url_verification" && req.body.challenge) {
      console.log("Handling URL verification challenge for events");
      res.status(200).json({ challenge: req.body.challenge });

      return;
    }

    // Respond 200 immediately to Slack.
    res.status(200).send();

    // Forward to both regions asynchronously.
    await forwardToRegions(webhookSecret, "slack", req.method, req.body);
  } catch (error) {
    console.error("Events router error:", error);
    if (!res.headersSent) {
      res.status(200).send();
    }
  }
});

app.post("/:webhookSecret/interactions", async (req, res) => {
  const { webhookSecret } = req.params;

  try {
    // Respond 200 immediately to Slack.
    res.status(200).send();

    // Forward to both regions asynchronously.
    await forwardToRegions(
      webhookSecret,
      "slack_interaction",
      req.method,
      req.body
    );
  } catch (error) {
    console.error("Interactions router error:", error);
    if (!res.headersSent) {
      res.status(200).send();
    }
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Slack webhook router listening on port ${PORT}`);
});
