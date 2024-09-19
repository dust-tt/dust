import type { LightWorkspaceType } from "@dust-tt/types";

import type { PostRequestAccessBody } from "@app/pages/api/w/[wId]/data_sources/request_access";

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
