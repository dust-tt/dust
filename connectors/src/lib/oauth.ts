// This function is used to discreminate between a new OAuth connection and an old Nango/Github
// connection. It is used to support dual-use while migrating and should be unused by a connector
// once fully migrated
export function isDualUseOAuthConnectionId(connectionId: string): boolean {
  // TODO(spolu): make sure this function is removed once fully migrated.
  return connectionId.startsWith("con_");
}
