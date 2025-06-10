import { deleteFile } from "@connectors/connectors/google_drive/temporal/activities";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";

// Deleting all existing Google Drive CSV files
export async function main(): Promise<void> {
  try {
    const csvGoogleFiles = await GoogleDriveFiles.findAll({
      where: {
        mimeType: "text/csv",
      },
    });
    console.log(`Retrieved ${csvGoogleFiles.length} files from DB.`);

    const batchSize = 10;
    for (let i = 0; i < csvGoogleFiles.length; i += batchSize) {
      const batch = csvGoogleFiles.slice(i, i + batchSize);
      await Promise.all(batch.map((file) => deleteFile(file)));
      console.log(`Deleted batch of ${batch.length} CSV file(s).`);
    }

    console.log(
      `Successfully deleted all ${csvGoogleFiles.length} CSV file(s).`
    );
  } catch (error) {
    console.error("Error deleting CSV files:", error);
  }
}
main().catch(console.error);
