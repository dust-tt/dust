import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import {
  getSelectableContainer,
  internalIdFromTypeAndPath,
} from "@connectors/connectors/microsoft/lib/utils";
import { describe, expect, it } from "vitest";

const SITE_ID =
  "contoso.sharepoint.com,2c5a3b1e-1111-2222-3333-444455556666,7d8e9f00-aaaa-bbbb-cccc-ddddeeeeffff";
const PERSONAL_SITE_ID =
  "contoso-my.sharepoint.com,2c5a3b1e-1111-2222-3333-444455556666,7d8e9f00-aaaa-bbbb-cccc-ddddeeeeffff";
const DRIVE_ID = "b!AbC_dEf-123";
const ITEM_ID = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function encode(nodeType: MicrosoftNodeType, itemAPIPath: string) {
  return internalIdFromTypeAndPath({ nodeType, itemAPIPath });
}

describe("getSelectableContainer", () => {
  it("accepts the sites root", () => {
    expect(getSelectableContainer(encode("sites-root", ""))).toEqual({
      type: "sites-root",
    });
  });

  it("returns the containing site for sites and lists", () => {
    expect(getSelectableContainer(encode("site", `/sites/${SITE_ID}`))).toEqual(
      { type: "site", siteId: SITE_ID }
    );
    expect(
      getSelectableContainer(encode("list", `/sites/${SITE_ID}/lists/abc-123`))
    ).toEqual({ type: "site", siteId: SITE_ID });
  });

  it("returns the containing drive for drives and folders", () => {
    expect(
      getSelectableContainer(encode("drive", `/drives/${DRIVE_ID}`))
    ).toEqual({ type: "drive", driveId: DRIVE_ID });
    expect(
      getSelectableContainer(
        encode("folder", `/drives/${DRIVE_ID}/items/${ITEM_ID}`)
      )
    ).toEqual({ type: "drive", driveId: DRIVE_ID });
  });

  it.each([
    ["drive", "/me/drive"],
    ["drive", "/users/someone@contoso.com/drive"],
    ["site", "/users/someone"],
    ["site", `/sites/${SITE_ID}/sites`],
    ["drive", `/drives/${DRIVE_ID}?$select=id`],
    ["drive", `/drives/${DRIVE_ID}#`],
    ["drive", "/drives/.."],
    ["folder", `/drives/${DRIVE_ID}/items/..`],
    ["folder", `/drives/${DRIVE_ID}/root:/path`],
    ["file", `/drives/${DRIVE_ID}/items/${ITEM_ID}`],
    ["worksheet", `/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets/1`],
    ["site", "/sites/contoso.sharepoint.com"],
    ["site", "/sites/contoso.sharepoint.com,foo,bar"],
    ["site", "/sites/2c5a3b1e-1111-2222-3333-444455556666"],
    ["site", `/sites/${PERSONAL_SITE_ID}`],
    ["list", `/sites/${PERSONAL_SITE_ID}/lists/abc-123`],
  ] as const)("rejects %s %s", (nodeType, itemAPIPath) => {
    expect(getSelectableContainer(encode(nodeType, itemAPIPath))).toBeNull();
  });

  it("rejects ids that are not canonically encoded", () => {
    const internalId = encode("drive", `/drives/${DRIVE_ID}`);
    expect(getSelectableContainer(`${internalId}=`)).toBeNull();
    expect(getSelectableContainer(`${internalId}*`)).toBeNull();
    expect(getSelectableContainer("not-microsoft")).toBeNull();
    expect(
      getSelectableContainer(
        "microsoft-" + Buffer.from("unknown//drives/x").toString("base64url")
      )
    ).toBeNull();
  });
});
