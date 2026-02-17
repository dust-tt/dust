import {
  createDataSourceWithoutProvider,
  upsertDocument,
} from "@app/lib/api/data_sources";
import { SpaceResource } from "@app/lib/resources/space_resource";

import type { DataSourceAsset, SeedContext } from "./types";

export async function seedDataSources(
  ctx: SeedContext,
  assets: DataSourceAsset[]
): Promise<void> {
  const { auth, workspace, execute, logger } = ctx;

  if (!execute) {
    logger.info("Dry run: would create data sources");
    return;
  }

  const plan = auth.plan();
  if (!plan) {
    throw new Error("No plan found for workspace");
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  for (const asset of assets) {
    logger.info({ name: asset.name }, "Creating data source...");

    const result = await createDataSourceWithoutProvider(auth, {
      plan,
      owner: workspace,
      space: globalSpace,
      name: asset.name,
      description: asset.description,
    });

    if (result.isErr()) {
      // Skip if already exists.
      if (result.error.code === "invalid_request_error") {
        logger.info(
          { name: asset.name },
          "Data source already exists, skipping"
        );
        continue;
      }
      throw new Error(
        `Failed to create data source ${asset.name}: ${result.error.message}`
      );
    }

    const dsView = result.value;
    logger.info({ name: asset.name, sId: dsView.sId }, "Data source created");

    // Upsert documents.
    for (const doc of asset.documents) {
      const upsertResult = await upsertDocument({
        document_id: doc.id,
        dataSource: dsView.dataSource,
        auth,
        mime_type: "text/plain",
        title: doc.title,
        text: doc.content,
        parents: [doc.id],
        light_document_output: true,
      });

      if (upsertResult.isErr()) {
        logger.error(
          { documentId: doc.id, error: upsertResult.error.message },
          "Failed to upsert document"
        );
        continue;
      }

      logger.info(
        { documentId: doc.id, title: doc.title },
        "Document upserted"
      );
    }
  }
}
