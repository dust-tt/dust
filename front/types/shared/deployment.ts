import * as child_process from "child_process";

import type { LoggerInterface } from "./logger";

const { SLACK_USER_OPERATION_BOT_TOKEN, NODE_ENV } = process.env;

// We might want to delete this, once we make progress out of Sequelize synchronisation.
async function sendInitDbMessage({
  service,
  logger,
}: {
  service: string;
  logger: LoggerInterface;
}) {
  if (NODE_ENV !== "production") {
    return;
  }

  if (!SLACK_USER_OPERATION_BOT_TOKEN) {
    logger.info({}, "SLACK_USER_OPERATION_BOT_TOKEN is not set");
    return;
  }

  // get the current commit id
  let commitId = "unknown";

  try {
    commitId = child_process.execSync("git rev-parse HEAD").toString().trim();
  } catch (error) {
    logger.error({}, "Failed to get commit id");
  }

  const message = `papertrail: \`initdb\` has been initiated. Service: \`${service}\`. CommitId: \`${commitId}\``;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_USER_OPERATION_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: "deployments",
        text: "",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
        ],
        mrkdown: true,
      }),
    });

    const jsonRes = await res.json();
    if (!jsonRes.ok) {
      logger.error(
        { error: jsonRes.error },
        "Failed to send slack message(1)."
      );
    }
  } catch (error) {
    logger.error({ error: error }, "Failed to send slack message(2).");
  }
}
