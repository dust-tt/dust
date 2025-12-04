import { clientFetch } from "@app/lib/egress/client";
import type { PostRequestAccessBody } from "@app/pages/api/w/[wId]/data_sources/request_access";
import type { PostRequestFeatureAccessBody } from "@app/pages/api/w/[wId]/labs/request_access";
import type { PostRequestActionsAccessBody } from "@app/pages/api/w/[wId]/mcp/request_access";
import type { LightWorkspaceType } from "@app/types";

export async function sendRequestDataSourceEmail({
  owner,
  emailMessage,
  dataSourceId,
}: {
  emailMessage: string;
  dataSourceId: string;
  owner: LightWorkspaceType;
}) {
  const emailBlob: PostRequestAccessBody = {
    emailMessage,
    dataSourceId,
  };

  const res = await clientFetch(
    `/api/w/${owner.sId}/data_sources/request_access`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailBlob),
    }
  );

  if (!res.ok) {
    const errorData = await res.json();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

  const res = await clientFetch(`/api/w/${owner.sId}/labs/request_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBlob),
  });

  if (!res.ok) {
    const errorData = await res.json();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    throw new Error(errorData.error?.message || "Failed to send email");
  }

  return res.json();
}

export async function sendRequestActionsAccessEmail({
  owner,
  emailMessage,
  mcpServerViewId,
}: {
  owner: LightWorkspaceType;
  emailMessage: string;
  mcpServerViewId: string;
}) {
  const emailBlob: PostRequestActionsAccessBody = {
    emailMessage,
    mcpServerViewId,
  };

  const res = await clientFetch(`/api/w/${owner.sId}/mcp/request_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBlob),
  });

  if (!res.ok) {
    const errorData = await res.json();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    throw new Error(errorData.error?.message || "Failed to send email");
  }

  return res.json();
}
