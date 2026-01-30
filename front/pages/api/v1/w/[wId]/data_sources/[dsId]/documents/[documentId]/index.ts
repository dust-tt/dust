/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]/index";

// Next.js config requires literal values (static analysis). 16MB accommodates 5MB document content
// (MAX_LARGE_DOCUMENT_TXT_LEN in connectors) plus ~3x JSON encoding overhead for escaping.
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
