import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/data_sources/[dsId]/documents/[documentId]/index";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
