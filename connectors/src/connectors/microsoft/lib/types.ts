export const MICROSOFT_NODE_TYPES = [
  "sites-root",
  "teams-root",
  "site",
  "team",
  "drive",
  "folder",
  "file",
  "page",
  "channel",
  "message",
  "worksheet",
] as const;
export type MicrosoftNodeType = (typeof MICROSOFT_NODE_TYPES)[number];

export function isValidNodeType(
  nodeType: string
): nodeType is MicrosoftNodeType {
  return MICROSOFT_NODE_TYPES.includes(nodeType as MicrosoftNodeType);
}

/* A specific situation for the Microsoft connector leads us to not use the
 * externally provided id (although it exists and is unique), but to compute our
 * own `internal id`. This is because the Microsoft API does not allow to query a document or
 * list its children using its id alone. We compute an internal id that contains all
 * information. More details
 * [here](https://www.notion.so/dust-tt/Design-Doc-Microsoft-ids-parents-c27726652aae45abafaac587b971a41d?pvs=4)
 */
export type MicrosoftNode = {
  nodeType: MicrosoftNodeType;
  name: string | null;
  internalId: string;
  parentInternalId: string | null;
  mimeType: string | null;
};
