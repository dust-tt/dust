/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tId]/rows/[rId]";

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
