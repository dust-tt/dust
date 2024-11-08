import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiResponse } from "next";

const heartbeatInterval = 60000;

export const resetHeartbeat = (
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  heartbeat?: { value: NodeJS.Timeout | undefined }
) => {
  if (heartbeat?.value) {
    clearTimeout(heartbeat.value);
  }
  const newHolder = heartbeat || { value: undefined };
  newHolder.value = setTimeout(() => {
    // Send a heartbeat if no event is received within the interval
    res.write(`data: ${JSON.stringify({ data: { type: "heartbeat" } })}\n\n`);

    // @ts-expect-error we need to flush for streaming but TS thinks flush() does not exists.
    res.flush(); // Ensure the heartbeat is sent immediately

    resetHeartbeat(res, newHolder);
  }, heartbeatInterval);
  return newHolder;
};

export const clearHeartbeat = (heartbeat: {
  value: NodeJS.Timeout | undefined;
}) => {
  if (heartbeat?.value) {
    clearTimeout(heartbeat.value);
  }
};
