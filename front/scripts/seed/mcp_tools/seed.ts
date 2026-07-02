import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UnsavedServerSideMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { EXTRACT_DATA_SERVER } from "@app/lib/api/actions/servers/extract_data/metadata";
import { INCLUDE_DATA_SERVER } from "@app/lib/api/actions/servers/include_data/metadata";
import { SEARCH_SERVER_NAME } from "@app/lib/api/actions/servers/search/metadata";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import type { DataSourceAsset } from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedDataSources,
} from "@app/scripts/seed/factories";
import type { LightWorkspaceType } from "@app/types/user";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const DATA_SOURCE_NAME = "MCP Tools Seed CRM";

const DATA_SOURCES: DataSourceAsset[] = [
  {
    name: DATA_SOURCE_NAME,
    description: "Seeded CRM opportunity data for MCP tool testing.",
    documents: [
      {
        id: "mcp-tools-seed-closed-won",
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
        id: "mcp-tools-seed-closed-lost",
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
  type: "object",
  properties: {
    deal: {
      type: "string",
      description: "The opportunity or deal name.",
    },
    amount: {
      type: "string",
      description: "The amount exactly as written in the source document.",
    },
    sales_rep: {
      type: "string",
      description: "The sales representative associated with the deal.",
    },
    stage: {
      type: "string",
      description: "The opportunity stage.",
    },
  },
  required: ["deal", "amount", "sales_rep", "stage"],
} satisfies JSONSchema;

type SeededMCPToolAgent = {
  agentName: string;
  agentDescription: string;
  instructions: string;
  serverName: AutoInternalMCPServerNameType;
  actionName: string;
  actionDescription: string;
  jsonSchema: JSONSchema | null;
  timeFrame: UnsavedServerSideMCPServerConfigurationType["timeFrame"];
};

const MCP_TOOL_AGENTS: SeededMCPToolAgent[] = [
  {
    agentName: "MCPToolSeedSearchAgent",
    agentDescription: "Searches seeded CRM documents with semantic search.",
    instructions:
      "Use the configured semantic search tool to answer questions about the seeded CRM documents.",
    serverName: SEARCH_SERVER_NAME,
    actionName: SEARCH_SERVER_NAME,
    actionDescription: "Search seeded CRM documents.",
    jsonSchema: null,
    timeFrame: null,
  },
  {
    agentName: "MCPToolSeedIncludeDataAgent",
    agentDescription: "Includes seeded CRM documents as context.",
    instructions:
      "Use the configured Include Data tool when the user asks for CRM document context.",
    serverName: INCLUDE_DATA_SERVER.serverInfo.name,
    actionName: INCLUDE_DATA_SERVER.serverInfo.name,
    actionDescription: "Include seeded CRM documents.",
    jsonSchema: null,
    timeFrame: { duration: 2, unit: "year" },
  },
  {
    agentName: "MCPToolSeedExtractDataAgent",
    agentDescription:
      "Extracts structured CRM deal records from seeded documents.",
    instructions:
      "Use the configured Extract Data tool to extract CRM deal records from the seeded documents.",
    serverName: EXTRACT_DATA_SERVER.serverInfo.name,
    actionName: EXTRACT_DATA_SERVER.serverInfo.name,
    actionDescription:
      "Extract structured CRM deal records from the seeded CRM documents.",
    jsonSchema: DEAL_SCHEMA,
    timeFrame: { duration: 2, unit: "year" },
  },
];

async function createAgentWithTool({
  agent,
  auth,
  user,
  workspace,
  dataSourceViewId,
  mcpServerViewId,
}: {
  agent: SeededMCPToolAgent;
  auth: Authenticator;
  user: UserResource;
  workspace: LightWorkspaceType;
  dataSourceViewId: string;
  mcpServerViewId: string;
}) {
  const existingAgents = await searchAgentConfigurationsByName(
    auth,
    agent.agentName
  );
  const existingAgent = existingAgents.find((a) => a.name === agent.agentName);
  if (existingAgent) {
    return { agentSId: existingAgent.sId, actionSId: null };
  }

  const agentResult = await createAgentConfiguration(auth, {
    name: agent.agentName,
    description: agent.agentDescription,
    instructions: agent.instructions,
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
      name: agent.actionName,
      description: agent.actionDescription,
      mcpServerViewId,
      dataSources: [
        {
          workspaceId: workspace.sId,
          dataSourceViewId,
          filter: { parents: null, tags: null },
        },
      ],
      tables: null,
      childAgentId: null,
      timeFrame: agent.timeFrame,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      jsonSchema: agent.jsonSchema,
    } satisfies UnsavedServerSideMCPServerConfigurationType,
    agentResult.value
  );
  if (actionResult.isErr()) {
    throw actionResult.error;
  }

  return {
    agentSId: agentResult.value.sId,
    actionSId: actionResult.value.sId,
  };
}

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });
  const { auth, user, workspace } = ctx;

  logger.info("Seeding MCP tools data source...");
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

  const mcpServerViews =
    await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
      auth,
      MCP_TOOL_AGENTS.map((agent) => agent.serverName)
    );

  for (const agent of MCP_TOOL_AGENTS) {
    const mcpServerView = mcpServerViews.get(agent.serverName);
    if (!mcpServerView) {
      throw new Error(
        `Could not find MCP server view for ${agent.serverName}.`
      );
    }

    const result = await createAgentWithTool({
      agent,
      auth,
      user,
      workspace,
      dataSourceViewId: dataSourceView.sId,
      mcpServerViewId: mcpServerView.sId,
    });

    logger.info(
      {
        agentName: agent.agentName,
        agentSId: result.agentSId,
        actionSId: result.actionSId,
      },
      "MCP tools seed agent ready"
    );
  }
});
