import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

makeScript({}, async ({ execute }, logger) => {
  const where = {
    type: "google_drive",
    [Op.and]: [
      { firstSyncProgress: { [Op.not]: null } },
      { firstSyncProgress: { [Op.ne]: "" } },
    ],
  };

  const connectorsCount = await ConnectorModel.count({ where });
  logger.info(
    { connectorsCount },
    "Found google_drive connectors with non-null firstSyncProgress"
  );

  if (!execute) {
    logger.info("Dry run mode. Pass -e to clear firstSyncProgress.");
    return;
  }

  const [updatedCount] = await ConnectorModel.update(
    {
      firstSyncProgress: "",
    },
    { where }
  );

  logger.info(
    { updatedCount },
    "Cleared firstSyncProgress on google_drive connectors"
  );
});
