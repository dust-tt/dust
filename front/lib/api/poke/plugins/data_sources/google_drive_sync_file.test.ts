import { extractGoogleDriveFileId } from "@app/lib/api/poke/plugins/data_sources/google_drive_sync_file";
import { describe, expect, it } from "vitest";

describe("extractGoogleDriveFileId", () => {
  it("extracts IDs from Google Drive folder URLs", () => {
    expect(
      extractGoogleDriveFileId(
        "https://drive.google.com/drive/folders/1P8oP_Ro7P97xvc--x6bU9wZdL-s6xoCd"
      )
    ).toBe("1P8oP_Ro7P97xvc--x6bU9wZdL-s6xoCd");

    expect(
      extractGoogleDriveFileId(
        "https://drive.google.com/drive/u/0/folders/1P8oP_Ro7P97xvc--x6bU9wZdL-s6xoCd"
      )
    ).toBe("1P8oP_Ro7P97xvc--x6bU9wZdL-s6xoCd");
  });
});
