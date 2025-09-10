/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tId]/index";

/**
 * @ignoreswagger
 * Legacy endpoint. Still relied on by connectors.
 */
export default handler;
