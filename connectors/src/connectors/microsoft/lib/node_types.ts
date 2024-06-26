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
] as const;
export type MicrosoftNodeType = (typeof MICROSOFT_NODE_TYPES)[number];

export function isValidNodeType(
  nodeType: string
): nodeType is MicrosoftNodeType {
  return MICROSOFT_NODE_TYPES.includes(nodeType as MicrosoftNodeType);
}
