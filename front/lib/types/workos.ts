export enum WorkOSPortalIntent {
  SSO = "sso",
  DSync = "dsync",
  DomainVerification = "domain_verification",
  AuditLogs = "audit_logs",
  LogStreams = "log_streams",
  CertificateRenewal = "certificate_renewal",
}

export type WorkOSConnectionSyncStatus = {
  status: "not_configured" | "configuring" | "configured";
  connection: {
    id: string;
    state:
      | "draft"
      | "active"
      | "inactive"
      | "validating"
      | "deleting"
      | "invalid_credentials";
    type: string;
  } | null;
};

export type WorkOSSSOConnectionStatus = WorkOSConnectionSyncStatus & {
  setupSSOLink: string;
};
