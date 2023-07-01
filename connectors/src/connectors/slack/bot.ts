import { DustAPI, DustAppType } from "@connectors/lib/dust_api";
import { Connector } from "@connectors/lib/models";
import { Err, Ok } from "@connectors/lib/result";

export async function ask(message: string, connectorId: number) {
  console.log("calling ask with message", message);
  console.log("1");
  const connector = await Connector.findByPk(connectorId);
  console.log("2");
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  console.log("3");
  connector.workspaceId = "0ec9852c2f";
  const dustAPIClient = new DustAPI({
    apiKey: connector.workspaceAPIKey,
    workspaceId: connector.workspaceId,
  });
  console.log("4");
  const dataSourcesRes = await dustAPIClient.getDataSources(
    connector.workspaceId
  );
  console.log("5");
  if (dataSourcesRes.isErr()) {
    return new Err(dataSourcesRes.error);
  }
  console.log("6");
  const dataSources = dataSourcesRes.value;

  // console.log("found data sources", dataSources);

  const retrievalApp: DustAppType = {
    workspaceId: "78bda07b39",
    appId: "0d7ab66fd2",
    appHash: "63d4bea647370f23fa396dc59347cfbd92354bced26783c9a99812a8b1b14371",
  };
  const retrievalAppConfig = {
    DATASOURCE: {
      data_sources: dataSources.map((ds) => {
        return { workspace_id: connector.workspaceId, data_source_id: ds.name };
      }),
      top_k: 8,
      filter: { tags: null, timestamp: null },
      use_cache: false,
    },
  };
  const retrievalInput = {
    messages: [
      {
        role: "user",
        runAssistant: false,
        runRetrieval: true,
        message: message,
      },
    ],
    userContext: {
      timeZone: "Europe/Paris",
      localeString: "en-US",
    },
  };
  const retrivalRes = await dustAPIClient.runApp(
    retrievalApp,
    retrievalAppConfig,
    [retrievalInput]
  );
  const retrievals = retrivalRes.run.results[0][0].value.retrievals;
  // console.log("retrivals are **********", retrievals);

  const chatApp: DustAppType = {
    workspaceId: "78bda07b39",
    appId: "0052be4be7",
    appHash: "2e9a8dbea83076c23d235f1dce273570542c4f11e9a0e7decefa9c26c78654e9",
  };
  const chatAppConfig = {
    MODEL: {
      provider_id: "openai",
      model_id: "gpt-4-0613",
      function_call: "auto",
      use_cache: true,
    },
  };
  const chatInput = {
    messages: [
      {
        role: "user",
        runRetrieval: true,
        runAssistant: true,
        message: message,
      },
      {
        role: "retrieval",
        retrievals: retrievals,
      },
    ],
    context: {
      user: {
        username: "spolu",
        full_name: "Stanislas Polu",
      },
      workspace: "dust",
      date_today: "2023-06-02",
    },
  };
  const chatRes = await dustAPIClient.runApp(chatApp, chatAppConfig, [
    chatInput,
  ]);
  // console.log("chatRes", JSON.stringify(chatRes, null, 2));
  const meta = retrievalsToText(retrievals);
  // console.log("~~~~~~~~~~~~~~~~ meta", meta);
  const answer = `${chatRes.run.results[0][0].value.message}`;

  return new Ok({ text: answer, retrival: meta });

  // console.log("retrived", retrivalRes.run.results[0][0].value.retrievals);
}

function retrievalsToText(
  retrievals: {
    sourceUrl: string;
    tags: string[];
  }[]
) {
  return retrievals
    .map((r) => {
      return `:link: ${r.sourceUrl} (${r.tags
        .filter((t) => t.startsWith("title"))
        .map((t) => t.split(":")[1])
        .join(", ")})`;
    })
    .join("\n");
}
