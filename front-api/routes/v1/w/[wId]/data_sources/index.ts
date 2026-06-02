import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { GetDataSourcesResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

import checkUpsertQueue from "./[dsId]/check_upsert_queue";
import documents from "./[dsId]/documents";
import blob from "./[dsId]/documents/[documentId]/blob";
import folders from "./[dsId]/folders";
import search from "./[dsId]/search";
import tables from "./[dsId]/tables";
import tokenize from "./[dsId]/tokenize";

// Legacy `/data_sources` mount (no `:spaceId` in the path). The real handlers
// live in the canonical space-scoped routes; the children below re-export
// them, and those space-scoped handlers fall back to the workspace global
// space when `:spaceId` is absent (via `resolveLegacyDataSourceSpaceId`). This
// mirrors the Next legacy tree under `pages/api/v1/w/[wId]/data_sources`.
const app = publicApiApp();

// `/blob` is non-spaced only and must be matched before the documents sub-app.
app.route("/:dsId/documents/:documentId/blob", blob);
app.route("/:dsId/check_upsert_queue", checkUpsertQueue);
app.route("/:dsId/documents", documents);
app.route("/:dsId/folders", folders);
app.route("/:dsId/search", search);
app.route("/:dsId/tables", tables);
app.route("/:dsId/tokenize", tokenize);

/**
 * @ignoreswagger
 * Legacy endpoint. The canonical documented route is the space-scoped
 * `/spaces/{spaceId}/data_sources`; here `withSpace` falls back to the
 * workspace global space.
 */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetDataSourcesResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const dataSources = await DataSourceResource.listBySpace(auth, space);

    return ctx.json({
      data_sources: dataSources.map((ds) => ds.toJSON()),
    });
  }
);

export default app;
