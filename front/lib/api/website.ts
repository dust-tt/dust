import type { WebCrawlerConfigurationType } from "@dust-tt/types";

export async function updateWebsite(
  workspaceId: string,
  spaceId: string,
  dataSourceId: string,
  config: WebCrawlerConfigurationType
) {
  const res = await fetch(
    `/api/w/${workspaceId}/spaces/${spaceId}/data_sources/${dataSourceId}/configuration`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configuration: config }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error.message);
  }
  return res.json();
}

export async function createWebsite(
  workspaceId: string,
  spaceId: string,
  name: string,
  config: WebCrawlerConfigurationType
) {
  const res = await fetch(
    `/api/w/${workspaceId}/spaces/${spaceId}/data_sources`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "webcrawler",
        name,
        configuration: config,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error.message);
  }
  return res.json();
}
