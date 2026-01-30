/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]/index";

// Next.js config must use literal values (cannot be statically analyzed otherwise).
// If wishing to change this value, see DOCUMENT_UPSERT_BODY_PARSER_LIMIT in lib/api/config.ts.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
    },
  },
};

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
