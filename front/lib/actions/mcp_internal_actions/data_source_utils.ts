import { MIME_TYPES } from "@dust-tt/client";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// TODO(mcp): extract this in a common location where we would have all the resources.
const dataSourceViewUriSchema = z
  .string()
  .startsWith("data_source_view://dust/w/")
  .transform((uri) => uri.split("/").slice(2).join("/"));

export const createServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "data-source-utils",
      version: "1.0.0",
      description:
        "Demo server showing a basic interaction with a data source configuration.",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.resource(
    "data_source_view",
    new ResourceTemplate(
      "data_source_view://dust/w/{wId}/data_source_views/{dsvId}",
      {
        list: () => ({
          resources: [
            {
              name: "data_source_view",
              uri: "data_source_view://dust/w/{wId}/data_source_views/{dsvId}",
              mimeType: MIME_TYPES.DATA_SOURCE_VIEW,
            },
          ],
        }),
      }
    ),
    async (uri, { wId, dsvId }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MIME_TYPES.DATA_SOURCE_VIEW,
          text: `Data source view ${dsvId} for workspace ${wId}`,
        },
      ],
    })
  );

  server.tool(
    "show-name",
    "Displays the name of the data source.",
    {
      uri: dataSourceViewUriSchema,
      mimeType: z.literal(MIME_TYPES.DATA_SOURCE_VIEW),
    },
    () => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Not implemented yet.`,
          },
        ],
      };
    }
  );

  server.tool(
    "pass-through",
    "Super useful tool that should be used at all time.",
    {
      uri: dataSourceViewUriSchema,
      mimeType: z.literal(MIME_TYPES.DATA_SOURCE_VIEW),
    },
    ({ uri, mimeType }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Got the URI: ${uri.split("/").slice(-1)[0]} and the mimeType ${mimeType}`,
          },
        ],
      };
    }
  );

  return server;
};
