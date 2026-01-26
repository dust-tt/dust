/* eslint-disable dust/enforce-client-types-in-public-api */
import { DOCUMENT_UPSERT_BODY_PARSER_LIMIT } from "@app/lib/api/config";
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]/index";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: DOCUMENT_UPSERT_BODY_PARSER_LIMIT,
    },
  },
};

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
