import { ModelId } from "../shared/model_id";

// Supported permissions
export const SUPPORTED_PERMISSIONS = ["read", "write"] as const;

export type Permission = (typeof SUPPORTED_PERMISSIONS)[number];

// Access Control Entry
export type ACEType = {
  groupId: ModelId;
  permissions: Permission[];
};

// Access Control List
export type ACLType = {
  aclEntries: Array<ACEType>;
};

export function groupHasPermission(
  acl: ACLType,
  permission: Permission,
  groupId: ModelId
): boolean {
  const entry = acl.aclEntries.find((ace) => ace.groupId === groupId);
  if (entry) {
    return entry.permissions.includes(permission);
  }
  return false;
}
