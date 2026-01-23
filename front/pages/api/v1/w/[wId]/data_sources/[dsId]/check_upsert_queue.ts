/* eslint-disable dust/enforce-client-types-in-public-api */
import handler from "@app/pages/api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/check_upsert_queue";

/**
 * @ignoreswagger
 * Endpoint used only from Connectors. since we it doesn't know the space id.
 */
export default handler;
