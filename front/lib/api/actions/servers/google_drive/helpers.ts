import {
  getGoogleDocsClient,
  getGoogleDriveClient,
  getGoogleSheetsClient,
  getGoogleSlidesClient,
} from "@app/lib/providers/google_drive/utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { drive_v3 } from "googleapis";

export async function getDriveClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleDriveClient(accessToken);
}

export async function getSheetsClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleSheetsClient(accessToken);
}

export async function getDocsClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleDocsClient(accessToken);
}

export async function getSlidesClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleSlidesClient(accessToken);
}

interface SharingParams {
  type: "user" | "group" | "domain";
  role: "writer" | "commenter" | "reader";
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
  sendNotificationEmail?: boolean;
  emailMessage?: string;
}

export async function setFilePermission(
  drive: drive_v3.Drive,
  fileId: string,
  sharing: SharingParams
): Promise<drive_v3.Schema$Permission> {
  const res = await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    sendNotificationEmail: sharing.sendNotificationEmail,
    emailMessage: sharing.emailMessage,
    requestBody: {
      type: sharing.type,
      role: sharing.role,
      ...(["user", "group"].includes(sharing.type) && {
        emailAddress: sharing.emailAddress,
      }),
      ...(sharing.type === "domain" && { domain: sharing.domain }),
      ...(sharing.type === "domain" &&
        sharing.allowFileDiscovery !== undefined && {
          allowFileDiscovery: sharing.allowFileDiscovery,
        }),
    },
  });

  return res.data;
}
