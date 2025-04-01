import { getDustDataSourcesBucket } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";

const fakeDocument = {
  document_id: "not_found",
  full_text: "",
  sections: {
    prefix: null,
    content: null,
    sections: [],
  },
};

// Some data sources don't have a proper document in GCS, this script uploads a fake one.
// Relocation workflows expect a document to be present in GCS for each data source document.
makeScript(
  {
    path: {
      type: "string",
      demandOption: true,
    },
  },
  async ({ path, execute }, logger) => {
    const fileStorage = getDustDataSourcesBucket();

    if (execute) {
      await fileStorage
        .file(path)
        .save(Buffer.from(JSON.stringify(fakeDocument, null, 2)), {
          contentType: "application/json",
        });

      logger.info(
        `Successfully uploaded fake document to gs://${fileStorage.name}/${path}`
      );
    } else {
      logger.info(
        `About to upload fake document to gs://${fileStorage.name}/${path}`
      );
    }
  }
);
