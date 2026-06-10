import type { RoleType } from "@app/types/user";

type WorkspacePermission =
  // Manage the workspace members
  | "workspace:manage_members"
  // Grant, modify, or revoke the `admin` role
  | "workspace:manage_admin_role"
  | "workspace:view_analytics"
  // Catch-all for admin-only areas (settings, billing, API, developer tools,
  // analytics, ...). Todo(admin_permissions): split into finer-grained permissions
  | "workspace:admin";

export type Permission = WorkspacePermission;

const BUSINESS_ADMIN_PERMISSIONS: Permission[] = [
  "workspace:manage_members",
  "workspace:view_analytics",
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...BUSINESS_ADMIN_PERMISSIONS,
  "workspace:manage_admin_role",
  "workspace:admin",
];

export const ROLE_PERMISSIONS: Record<RoleType, Set<Permission>> = {
  admin: new Set(ADMIN_PERMISSIONS),
  business_admin: new Set(BUSINESS_ADMIN_PERMISSIONS),
  builder: new Set(),
  user: new Set(),
  none: new Set(),
};

export function hasPermission(role: RoleType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
