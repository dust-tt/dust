/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

/**
 * @ignoreswagger
 * Legacy endpoint.
 */
export default handler;
