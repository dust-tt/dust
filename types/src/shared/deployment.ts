import { LoggerInterface } from "./logger";

export async function sendDeploymentMessage({
  service,
  logger,
}: {
  service: string;
  logger: LoggerInterface;
}) {
  const { SLACK_USER_OPERATION_BOT_TOKEN } = process.env;

  if (!SLACK_USER_OPERATION_BOT_TOKEN) {
    logger.info({}, "SLACK_USER_OPERATION_BOT_TOKEN is not set");
    return;
  }

  const message = `papertrail: Deployment has been initiated. Service: ${service}`;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_USER_OPERATION_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: "deployments",
        text: message,
      }),
    });

    const jsonRes = await res.json();
    if (!jsonRes.ok) {
      logger.error(
        { error: jsonRes.error },
        "Failed to send slack message(1)."
      );
    }

    // Log the result
  } catch (error) {
    logger.error({ error: error }, "Failed to send slack message(2).");
  }
}
