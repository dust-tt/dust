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

    await Promise.all(csvGoogleFiles.map((file) => deleteFile(file)));

    console.log("Successfully deleted all CSV files.");
  } catch (error) {
    console.error("Error deleting CSV files:", error);
  }
}
main().catch(console.error);
