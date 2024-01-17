import type { ConnectorResourceType } from "@dust-tt/types";
import { hash as blake3 } from "blake3";

// Generate a stable id for a given url and ressource type
// That way we don't have to send URL as documentId to the front API.
export function stableIdForUrl({
  url,
  ressourceType,
}: {
  url: string;
  ressourceType: ConnectorResourceType;
}) {
  return Buffer.from(blake3(`${ressourceType}-${url}`)).toString("hex");
}
