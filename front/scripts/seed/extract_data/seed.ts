import type { UnsavedServerSideMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { EXTRACT_DATA_SERVER } from "@app/lib/api/actions/servers/extract_data/metadata";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeScript } from "@app/scripts/helpers";
import type { DataSourceAsset } from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedDataSources,
} from "@app/scripts/seed/factories";

const DATA_SOURCE_NAME = "Extract Data Seed CRM";
const AGENT_NAME = "ExtractDataSeedAgent";

const DATA_SOURCES: DataSourceAsset[] = [
  {
    name: DATA_SOURCE_NAME,
    description: "Seeded CRM opportunity data for Extract Data testing.",
    documents: [
      {
        id: "extract-data-seed-closed-won",
        title: "Closed Won Opportunities",
        content:
          "Closed Won Opportunities\n\n" +
          "Deal: Enterprise License - Acme Corp\n" +
          "Amount: $450,000\n" +
          "Close Date: 2025-12-15\n" +
          "Sales Rep: Sarah Johnson\n" +
          "Stage: Closed Won\n\n" +
          "Deal: Annual Subscription - TechStart Inc\n" +
          "Amount: $120,000\n" +
          "Close Date: 2025-11-28\n" +
          "Sales Rep: Mike Chen\n" +
          "Stage: Closed Won\n",
      },
      {
        id: "extract-data-seed-closed-lost",
        title: "Closed Lost Opportunities",
        content:
          "Closed Lost Opportunities\n\n" +
          "Deal: Platform Upgrade - RetailMax\n" +
          "Amount: $200,000\n" +
          "Loss Date: 2025-12-20\n" +
          "Sales Rep: Lisa Park\n" +
          "Stage: Closed Lost\n" +
          "Loss Reason: Budget constraints\n\n" +
          "Deal: New Business - DataFlow Systems\n" +
          "Amount: $350,000\n" +
          "Loss Date: 2025-11-15\n" +
          "Sales Rep: Sarah Johnson\n" +
          "Stage: Closed Lost\n" +
          "Loss Reason: Chose competitor\n",
      },
    ],
  },
];

const DEAL_SCHEMA = {
  type: "object" as const,
  properties: {
    deal: {
      type: "string" as const,
      description: "The opportunity or deal name.",
    },
    amount: {
      type: "string" as const,
      description: "The amount exactly as written in the source document.",
    },
    sales_rep: {
      type: "string" as const,
      description: "The sales representative associated with the deal.",
    },
    stage: {
      type: "string" as const,
      description: "The opportunity stage.",
    },
  },
  required: ["deal", "amount", "sales_rep", "stage"],
};

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });
  const { auth, user, workspace } = ctx;

  logger.info("Seeding Extract Data data source...");
  await seedDataSources(ctx, DATA_SOURCES);

  if (!execute) {
    return;
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    DATA_SOURCE_NAME
  );
  if (!dataSource) {
    throw new Error(`Data source ${DATA_SOURCE_NAME} was not found.`);
  }

  const [dataSourceView] = await DataSourceViewResource.listForDataSources(
    auth,
    [dataSource]
  );
  if (!dataSourceView) {
    throw new Error(`No data source view found for ${DATA_SOURCE_NAME}.`);
  }

  const existingAgents = await searchAgentConfigurationsByName(
    auth,
    AGENT_NAME
  );
  const existingAgent = existingAgents.find((a) => a.name === AGENT_NAME);
  if (existingAgent) {
    logger.info(
      { sId: existingAgent.sId, name: AGENT_NAME },
      "Extract Data seed agent already exists, skipping"
    );
    return;
  }

  const extractDataView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      EXTRACT_DATA_SERVER.serverInfo.name
    );
  if (!extractDataView) {
    throw new Error("Could not find Extract Data MCP server view.");
  }

  const agentResult = await createAgentConfiguration(auth, {
    name: AGENT_NAME,
    description: "Extracts structured CRM deal records from seeded documents.",
    instructions:
      "Use the Extract Data tool to extract CRM deal records from the configured data source.",
    instructionsHtml: null,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status: "active",
    scope: "visible",
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      temperature: 0.2,
    },
    templateId: null,
    requestedSpaceIds: [],
    tags: [],
    editors: [user.toJSON()],
    authorId: user.id,
  });
  if (agentResult.isErr()) {
    throw agentResult.error;
  }

  const actionResult = await createAgentActionConfiguration(
    auth,
    {
      type: "mcp_server_configuration",
      name: EXTRACT_DATA_SERVER.serverInfo.name,
      description:
        "Extract structured CRM deal records from the seeded CRM documents.",
      mcpServerViewId: extractDataView.sId,
      dataSources: [
        {
          workspaceId: workspace.sId,
          dataSourceViewId: dataSourceView.sId,
          filter: { parents: null, tags: null },
        },
      ],
      tables: null,
      childAgentId: null,
      timeFrame: { duration: 2, unit: "year" },
      additionalConfiguration: {},
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      jsonSchema: DEAL_SCHEMA,
    } satisfies UnsavedServerSideMCPServerConfigurationType,
    agentResult.value
  );
  if (actionResult.isErr()) {
    throw actionResult.error;
  }

  logger.info(
    {
      agentSId: agentResult.value.sId,
      dataSourceViewSId: dataSourceView.sId,
      actionSId: actionResult.value.sId,
    },
    "Extract Data seed completed"
  );
});
