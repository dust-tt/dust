import { publicApiApp } from "@front-api/middlewares/ctx";
import spacedDataSources from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources";

import blob from "./[dsId]/documents/[documentId]/blob";

/**
 * @ignoreswagger
 * Legacy endpoint.
 *
 * Mounts the spaced `data_sources` sub-app: handlers read `:spaceId` from
 * the URL when present, and fall back to the workspace's global space when
 * it isn't (matching the legacy Next behavior). The `/blob` sub-route only
 * exists on the legacy (non-spaced) path, so it is mounted here explicitly
 * before the catch-all delegation.
 */
const app = publicApiApp();

// `/blob` is non-spaced only and must be matched before delegating.
app.route("/:dsId/documents/:documentId/blob", blob);

app.route("/", spacedDataSources);

export default app;
