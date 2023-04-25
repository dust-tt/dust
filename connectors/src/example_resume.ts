(async () => {
  if (!process.env.NOTION_NANGO_CONNECTION_ID) {
    console.error("NOTION_NANGO_CONNECTION_ID not set");
    process.exit(1);
  }
  if (!process.env.DUST_API_KEY) {
    console.error("DUST_API_KEY not set");
    process.exit(1);
  }
  if (!process.env.DUST_CONNECTORS_SECRET) {
    console.error("DUST_CONNECTORS_SECRET not set");
    process.exit(1);
  }
  if (!process.env.NOTION_DATA_SOURCE_NAME) {
    console.error("NOTION_DATA_SOURCE_NAME not set");
    process.exit(1);
  }
  if (!process.env.DUST_WORKSPACE_ID) {
    console.error("NOTION_WORKSPACE_ID not set");
    process.exit(1);
  }

  const res = await fetch("http://localhost:3002/connectors/resume/notion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DUST_CONNECTORS_SECRET}`,
    },
    body: JSON.stringify({
      workspaceAPIKey: process.env.DUST_API_KEY,
      dataSourceName: process.env.NOTION_DATA_SOURCE_NAME,
      workspaceId: process.env.DUST_WORKSPACE_ID,
      nangoConnectionId: process.env.NOTION_NANGO_CONNECTION_ID,
    }),
  });

  if (res.status >= 200 && res.status < 300) {
    console.log("successfully resumed connector");
    console.log(await res.json());
  } else {
    const text = await res.text();
    console.error("error resuming connector", text);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
