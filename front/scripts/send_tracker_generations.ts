import { sendTrackerWithGenerationEmail } from "@app/lib/api/tracker";
import { TrackerGenerationModel } from "@app/lib/models/doc_tracker";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { isEmailValid } from "@app/lib/utils";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    generationIds: {
      type: "array",
      demandOption: true,
      description: "List of generation IDs",
    },
    email: {
      type: "string",
      demandOption: true,
      description: "Email address to send to",
    },
  },
  async ({ execute, generationIds, email }, logger) => {
    try {
      // Validate email
      if (!isEmailValid(email)) {
        throw new Error("Invalid email address");
      }

      // Parse and validate generation IDs
      const ids = generationIds.map((id) => parseInt(id));
      if (ids.some((id) => isNaN(id))) {
        throw new Error("Invalid generation IDs - must be numbers");
      }

      if (execute) {
        // Fetch generations with their data sources
        const generations = await TrackerGenerationModel.findAll({
          where: {
            id: ids,
          },
          include: [
            {
              model: DataSourceModel,
              required: true,
              as: "dataSource",
            },
            {
              model: DataSourceModel,
              as: "maintainedDocumentDataSource",
              required: false,
            },
          ],
        });

        if (generations.length === 0) {
          throw new Error("No generations found with the provided IDs");
        }

        // Convert to TrackerGenerationToProcess format
        const generationsToProcess = generations.map((g) => ({
          id: g.id,
          content: g.content,
          thinking: g.thinking,
          documentId: g.documentId,
          dataSource: {
            id: g.dataSource.id,
            name: g.dataSource.name,
            dustAPIProjectId: g.dataSource.dustAPIProjectId,
            dustAPIDataSourceId: g.dataSource.dustAPIDataSourceId,
          },
          maintainedDocumentId: g.maintainedDocumentId,
          maintainedDocumentDataSource: g.maintainedDocumentDataSource
            ? {
                id: g.maintainedDocumentDataSource.id,
                name: g.maintainedDocumentDataSource.name,
                dustAPIProjectId:
                  g.maintainedDocumentDataSource.dustAPIProjectId,
                dustAPIDataSourceId:
                  g.maintainedDocumentDataSource.dustAPIDataSourceId,
              }
            : null,
        }));

        // Send email
        await sendTrackerWithGenerationEmail({
          name: "Manual Generation Email",
          recipient: email,
          generations: generationsToProcess,
          localLogger: logger,
        });

        logger.info({}, "Email sent successfully");
      } else {
        logger.info(
          { generationIds: ids, email },
          "Dry run - would send email with these parameters"
        );
      }
    } finally {
      await frontSequelize.close();
    }
  }
);
