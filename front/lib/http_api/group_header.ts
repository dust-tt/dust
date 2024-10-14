import { DustGroupIdsHeader } from "@dust-tt/client";

export function getGroupIdsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string[] | undefined {
  const groupIds = headers[DustGroupIdsHeader.toLowerCase()];
  if (typeof groupIds === "string" && groupIds.trim().length > 0) {
    return groupIds.split(",").map((id) => id.trim());
  } else {
    undefined;
  }
}
