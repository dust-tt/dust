import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/apps/[aId]/runs/[runId]";

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
