import { LoggerInterface } from "./logger";

export async function sendUserOperationMessage({
  message,
  logger,
}: {
  message: string;
  logger: LoggerInterface;
}) {
  const { SLACK_USER_OPERATION_BOT_TOKEN, SLACK_USER_OPERATION_CHANNEL_ID } =
    process.env;

  if (!SLACK_USER_OPERATION_BOT_TOKEN || !SLACK_USER_OPERATION_CHANNEL_ID) {
    logger.info(
      {},
      "SLACK_USER_OPERATION_BOT_TOKEN or SLACK_USER_OPERATION_CHANNEL_ID is not set"
    );
    return;
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_USER_OPERATION_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: SLACK_USER_OPERATION_CHANNEL_ID,
        text: message,
      }),
    });

    const jsonRes = await res.json();
    if (!jsonRes.ok) {
      logger.error(
        { error: jsonRes.error },
        "Failed to send slack message to user operation channel (1)."
      );
    }

    // Log the result
  } catch (error) {
    logger.error(
      { error: error },
      "Failed to send slack message to user operation channel (2)."
    );
  }
}
