import { ShareableFileModel } from "@app/lib/resources/storage/models/files";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    logger.info("No action to perform");
  }
  const [updatedCount] = await ShareableFileModel.update(
    { shareScope: "workspace" },
    {
      where: {
        shareScope: "conversation_participants",
      },
    }
  );

  logger.info(
    `Updated ${updatedCount} shareable_files from "conversation_participants" to "workspace" scope`
  );
});
