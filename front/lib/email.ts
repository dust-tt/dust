import type { PostRequestAccessBody } from "@app/pages/api/w/[wId]/data_sources/request_access";
import type { PostRequestFeatureAccessBody } from "@app/pages/api/w/[wId]/labs/request_access";
import type { PostRequestActionsAccessBody } from "@app/pages/api/w/[wId]/mcp/request_access";
import type { LightWorkspaceType } from "@app/types";

export async function sendRequestDataSourceEmail({
  userTo,
  emailMessage,
  dataSourceName,
  owner,
}: {
  userTo: string;
  emailMessage: string;
  dataSourceName: string;
  owner: LightWorkspaceType;
}) {
  const emailBlob: PostRequestAccessBody = {
    emailMessage,
    dataSourceName,
    userTo,
  };

  const res = await fetch(`/api/w/${owner.sId}/data_sources/request_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBlob),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || "Failed to send email");
  }

  return res.json();
}

export async function sendRequestFeatureAccessEmail({
  emailMessage,
  featureName,
  owner,
}: {
  emailMessage: string;
  featureName: string;
  owner: LightWorkspaceType;
}) {
  const emailBlob: PostRequestFeatureAccessBody = {
    emailMessage,
    featureName,
  };

  const res = await fetch(`/api/w/${owner.sId}/labs/request_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBlob),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || "Failed to send email");
  }

  return res.json();
}

export async function sendRequestActionsAccessEmail({
  userTo,
  emailMessage,
  serverName,
  owner,
}: {
  userTo: string;
  emailMessage: string;
  serverName: string;
  owner: LightWorkspaceType;
}) {
  const emailBlob: PostRequestActionsAccessBody = {
    emailMessage,
    serverName,
    userTo,
  };

  const res = await fetch(`/api/w/${owner.sId}/mcp/request_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBlob),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || "Failed to send email");
  }

  return res.json();
}
