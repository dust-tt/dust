import { describe, expect, it } from "vitest";

import { extractGoogleDriveFileId } from "./file_id";

const ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg";

describe("extractGoogleDriveFileId", () => {
  it("returns a bare ID as is", () => {
    expect(extractGoogleDriveFileId(ID)).toBe(ID);
    expect(extractGoogleDriveFileId(`  ${ID}\n`)).toBe(ID);
  });

  it.each([
    `https://docs.google.com/document/d/${ID}/edit`,
    `https://docs.google.com/document/d/${ID}/edit?usp=sharing#heading=h.1`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
    `https://docs.google.com/presentation/d/${ID}/edit`,
    `https://docs.google.com/document/u/0/d/${ID}/edit`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/u/1/folders/${ID}?usp=sharing`,
    `https://drive.google.com/open?id=${ID}`,
  ])("extracts the ID from %s", (url) => {
    expect(extractGoogleDriveFileId(url)).toBe(ID);
  });

  it("returns null for non-Google URLs and other garbage", () => {
    expect(extractGoogleDriveFileId(`https://example.com/d/${ID}`)).toBeNull();
    expect(extractGoogleDriveFileId("https://docs.google.com/")).toBeNull();
    expect(extractGoogleDriveFileId("not an id!")).toBeNull();
  });
});
