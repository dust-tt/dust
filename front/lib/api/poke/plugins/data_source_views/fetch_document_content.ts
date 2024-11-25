import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";

export const fetchDocumentContentPlugin = createPlugin(
  {
    id: "fetch-document-content",
    name: "Fetch Document Content",
    description:
      "Retrieves the full content of a specific document from a data source view",
    resourceTypes: ["data_source_views"],
    args: {
      documentId: {
        type: "string",
        label: "Document ID",
        description:
          "The id of the document whose content you want to retrieve",
      },
    },
  },
  async (auth, dataSourceViewId, args) => {
    if (!dataSourceViewId) {
      return new Err(new Error("Data source view not found."));
    }

    const dataSourceView = await DataSourceViewResource.fetchById(
      auth,
      dataSourceViewId
    );

    if (!dataSourceView) {
      return new Err(new Error("Data source view not found."));
    }

    const { documentId } = args;
    if (documentId.trim().length === 0) {
      return new Err(new Error("Document ID is required."));
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const document = await coreAPI.getDataSourceDocument({
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      documentId: args.documentId,
      viewFilter: dataSourceView.toViewFilter(),
    });

    if (document.isErr()) {
      return new Err(new Error(document.error.message));
    }

    return new Ok({
      display: "json",
      value: {
        document_id: document.value.document.document_id,
        source_url: document.value.document.source_url,
        text: document.value.document.text,
        tags: document.value.document.tags,
      },
    });
  }
);