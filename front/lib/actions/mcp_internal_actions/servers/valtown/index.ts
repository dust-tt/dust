import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ValTown from "@valtown/sdk";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  callHttpEndpointSchema,
  createFileSchema,
  createValSchema,
  deleteFileSchema,
  getFileContentSchema,
  getValSchema,
  listValFilesSchema,
  listValsSchema,
  searchValsSchema,
  updateFileContentSchema,
  VALTOWN_TOOL_NAME,
  writeFileSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/valtown/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { decrypt, Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface ValTownError {
  status?: number;
  message?: string;
}

function isValTownError(error: unknown): error is ValTownError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "message" in error)
  );
}

async function getValTownClient(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<ValTown | null> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return null;
  }

  const secret = await DustAppSecretModel.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;

  if (!apiKey) {
    return null;
  }

  return new ValTown({
    bearerToken: apiKey,
  });
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(VALTOWN_TOOL_NAME);

  server.tool(
    "create_val",
    "Creates a new val in Val Town. Use create_file to add files to the val.",
    createValSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ name, privacy, description, orgId }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const val = await client.vals.create({
            name,
            privacy,
            ...(description && { description }),
            ...(orgId && { orgId }),
          });

          return new Ok([
            {
              type: "text" as const,
              text:
                `Successfully created val "${name}" with ID: ${val.id}\n` +
                (val.links?.self ? `Link to the val: ${val.links.self}\n` : ""),
            },
          ]);
        } catch (error: unknown) {
          if (isValTownError(error) && error.status === 409) {
            return new Err(
              new MCPError(
                `A val named "${name}" already exists in your account. Please either:\n` +
                  `1. Choose a different name for your new val\n` +
                  `2. Use the list_vals tool to see all your existing vals\n` +
                  `3. Delete the existing val from Val Town if you want to replace it`
              )
            );
          }

          return new Err(
            new MCPError(`Error creating val: ${normalizeError(error).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "get_val",
    "Gets a specific val by its ID",
    getValSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const val = await client.vals.retrieve(valId);

          let resultText = `Val Details:\n`;
          resultText += `Name: ${val.name}\n`;
          resultText += `ID: ${val.id}\n`;
          resultText += `Description: ${val.description ?? "No description"}\n`;
          resultText += `Privacy: ${val.privacy}\n`;
          resultText += `Author: ${val.author?.username ?? "Unknown"}\n`;
          if (val.links?.self) {
            resultText += `Self Link: ${val.links.self}\n`;
          }
          if (val.links?.html) {
            resultText += `HTML Link: ${val.links.html}\n`;
          }
          resultText += `Created: ${new Date(val.createdAt).toLocaleString()}\n`;

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error getting val: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "list_vals",
    "Lists vals available to the user's account",
    listValsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({
        limit,
        cursor,
        privacy,
        user_id,
        list_only_user_vals = true,
      }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const response = list_only_user_vals
            ? await client.me.vals.list({
                limit,
                ...(cursor && { cursor }),
              })
            : await client.vals.list({
                limit,
                ...(cursor && { cursor }),
                ...(privacy && { privacy }),
                ...(user_id && { user_id }),
              });

          const vals = response.data || [];

          let resultText = `Found ${vals.length} val(s):\n\n`;

          for (const val of vals) {
            resultText += `Name: ${val.name}\n`;
            resultText += `ID: ${val.id}\n`;
            resultText += `Description: ${val.description ?? "No description"}\n`;
            resultText += `Privacy: ${val.privacy}\n`;
            resultText += `Author: ${val.author?.username ?? "Unknown"}\n`;
            if (val.links?.self) {
              resultText += `Self Link: ${val.links.self}\n`;
            }
            if (val.links?.html) {
              resultText += `HTML Link: ${val.links.html}\n`;
            }
            if (val.author?.username) {
              resultText += `HTTP Endpoint: https://${val.author.username}-${val.name}.web.val.run\n`;
            }
            resultText += `Created: ${new Date(val.createdAt).toLocaleString()}\n`;
            resultText += `---\n`;
          }

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error listing vals: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "search_vals",
    "Searches for vals by name, description, or content",
    searchValsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ query, limit = 20, cursor, privacy }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const response = await client.vals.list({
            limit,
            ...(cursor && { cursor }),
            ...(privacy && { privacy }),
          });

          const allVals = response.data || [];

          const searchResults = allVals.filter((val) => {
            const searchText =
              `${val.name} ${val.description ?? ""}`.toLowerCase();
            return searchText.includes(query.toLowerCase());
          });

          let resultText = `Found ${searchResults.length} val(s) matching "${query}":\n\n`;

          for (const val of searchResults) {
            resultText += `Name: ${val.name}\n`;
            resultText += `ID: ${val.id}\n`;
            if (val.description) {
              resultText += `Description: ${val.description}\n`;
            }
            if (val.links?.self) {
              resultText += `API Link: ${val.links.self}\n`;
            }
            if (val.links?.html) {
              resultText += `HTML Link: ${val.links.html}\n`;
            }
            if (val.author?.username) {
              resultText += `HTTP Endpoint: https://${val.author.username}-${val.name}.web.val.run\n`;
            }
            resultText += `Created: ${new Date(val.createdAt).toLocaleString()}\n`;
            resultText += `---\n`;
          }

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error searching vals: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "list_val_files",
    "Lists all files in a specific val",
    listValFilesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, path = "", limit, offset }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const response = await client.vals.files.retrieve(valId, {
            path,
            recursive: true,
            ...(limit && { limit }),
            ...(offset && { offset }),
          });

          const files = Array.isArray(response)
            ? response
            : response.data || [];

          let resultText = `Found ${files.length} file(s) in val ${valId} at path "${path || "root"}":\n\n`;

          for (const file of files) {
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            resultText += `Path: ${file.path || "Unknown"}\n`;
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            resultText += `Type: ${file.type || "Unknown"}\n`;
            if (file.links) {
              if (file.links.self) {
                resultText += `Self Link: ${file.links.self}\n`;
              }
              if (file.links.html) {
                resultText += `HTML Link: ${file.links.html}\n`;
              }
              if (file.links.module) {
                resultText += `Module Link: ${file.links.module}\n`;
              }
              if (file.links.endpoint) {
                resultText += `Endpoint Link: ${file.links.endpoint}\n`;
              }
            }
            if (file.createdAt) {
              resultText += `Created: ${new Date(file.createdAt).toLocaleString()}\n`;
            }
            if (file.updatedAt) {
              resultText += `Updated: ${new Date(file.updatedAt).toLocaleString()}\n`;
            }
            resultText += `---\n`;
          }

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              `Error listing val files: ${normalizeError(err).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_file_content",
    "Gets the content of a specific file in a val using the Val Town API",
    getFileContentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const response = await client.vals.files.getContent(valId, {
            path: filePath,
          });

          const content = await response.text();
          let resultText = `File Content for ${filePath}:\n`;
          resultText += `\nContent:\n${content}`;

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              `Error getting file content: ${normalizeError(err).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "delete_file",
    "Deletes a specific file from a val using the Val Town API",
    deleteFileSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          await client.vals.files.delete(valId, {
            path: filePath,
            recursive: false,
          });

          return new Ok([
            {
              type: "text" as const,
              text: `Successfully deleted file "${filePath}" from val ${valId}`,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error deleting file: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "update_file_content",
    "Updates the content of a specific file in a val. Note: To change file type (e.g., to HTTP), use the file_update tool instead.",
    updateFileContentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath, content }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          await client.vals.files.update(valId, {
            path: filePath,
            content,
          });

          return new Ok([
            {
              type: "text" as const,
              text: `Successfully updated file "${filePath}" in val ${valId}\n`,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              `Error updating file content: ${normalizeError(err).message}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "write_file",
    "The primary function for writing content to files and updating file metadata. Use this to add content, change file type, rename files, or move files. For HTTP type: return value from serve handler must be a response or a promise resolving to a response.",
    writeFileSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath, content, name, type, parent_path }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const updateParams: any = {
            path: filePath,
          };

          if (content !== undefined) {
            updateParams.content = content;
          }
          if (name !== undefined) {
            updateParams.name = name;
          }
          if (type !== undefined) {
            updateParams.type = type;
          }
          if (parent_path !== undefined) {
            updateParams.parent_path = parent_path;
          }

          await client.vals.files.update(valId, updateParams);

          return new Ok([
            {
              type: "text" as const,
              text: `Successfully updated file "${filePath}" in val ${valId}${
                type ? ` (type: ${type})` : ""
              }\n`,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error updating file: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "create_file",
    "Creates a new empty file in an existing val. Use write_file to add content and set the file type.",
    createFileSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          await client.vals.files.create(valId, {
            path: filePath,
            content: "",
            type: "file",
          });

          return new Ok([
            {
              type: "text" as const,
              text: `Successfully created empty file "${filePath}" in val ${valId}. Use write_file to add content and set the file type.\n`,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error creating file: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  server.tool(
    "call_http_endpoint",
    "Runs an HTTP val endpoint by getting the file's endpoint link and making a request to it",
    callHttpEndpointSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: VALTOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ valId, filePath, body, method = "POST" }) => {
        const client = await getValTownClient(auth, agentLoopContext);
        if (!client) {
          return new Err(
            new MCPError(
              "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          let parsedBody: unknown = null;
          if (body) {
            try {
              parsedBody = JSON.parse(body);
            } catch (parseError) {
              return new Err(
                new MCPError(`Invalid JSON in body: ${parseError}`, {
                  tracked: false,
                })
              );
            }
          }

          const fileResponse = await client.vals.files.retrieve(valId, {
            path: filePath,
            recursive: true,
          });

          const targetFile = Array.isArray(fileResponse)
            ? fileResponse[0]
            : fileResponse.data?.[0] || fileResponse;

          if (!targetFile) {
            return new Err(
              new MCPError(`File "${filePath}" not found in val ${valId}`, {
                tracked: false,
              })
            );
          }

          if (!targetFile.links?.endpoint) {
            return new Err(
              new MCPError(
                `File "${filePath}" does not have an endpoint link. This file may not be an HTTP val.`,
                { tracked: false }
              )
            );
          }

          const requestOptions: any = {
            method,
          };

          if (parsedBody && method !== "GET") {
            requestOptions.headers = {
              "Content-Type": "application/json",
            };
            requestOptions.body = JSON.stringify(parsedBody);
          }

          const response = await untrustedFetch(
            targetFile.links.endpoint,
            requestOptions
          );

          const contentType = response.headers.get("content-type");
          let result: unknown;
          let resultText = `HTTP ${response.status} ${response.statusText}\n`;
          resultText += `Endpoint: ${targetFile.links.endpoint}\n\n`;

          if (contentType?.includes("application/json")) {
            result = await response.json();
            resultText += JSON.stringify(result, null, 2);
          } else {
            const textResult = await response.text();
            resultText += textResult;
          }

          return new Ok([
            {
              type: "text" as const,
              text: resultText,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(`Error triggering val: ${normalizeError(err).message}`)
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
