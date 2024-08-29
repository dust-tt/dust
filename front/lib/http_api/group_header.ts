import { DustGroupIdsHeader } from "@dust-tt/types";

export function getGroupIdsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string[] | undefined {
  const groupIds = headers[DustGroupIdsHeader.toLowerCase()];
  if (typeof groupIds === "string") {
    return groupIds.split(",").map((id) => id.trim());
  } else {
    undefined;
  }
}
