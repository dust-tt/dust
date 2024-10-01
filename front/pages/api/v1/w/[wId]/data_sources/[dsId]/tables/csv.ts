import handler from "@app/pages/api/v1/w/[wId]/vaults/[vId]/data_sources/[dsId]/tables/csv";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
