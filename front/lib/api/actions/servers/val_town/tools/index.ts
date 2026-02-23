import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getValTownClient,
  isValTownError,
} from "@app/lib/api/actions/servers/val_town/helpers";
import { VAL_TOWN_TOOLS_METADATA } from "@app/lib/api/actions/servers/val_town/metadata";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { RequestInit } from "undici";

const API_KEY_NOT_CONFIGURED_ERROR =
  "Val Town API key not configured. Please configure a secret containing your Val Town API key in the agent settings.";

export function createValTownTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof VAL_TOWN_TOOLS_METADATA> = {
    create_val: async ({ name, privacy, description, orgId }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    get_val: async ({ valId }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    list_vals: async ({
      limit,
      cursor,
      privacy,
      user_id,
      list_only_user_vals = true,
    }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    search_vals: async ({ query, limit = 20, cursor, privacy }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    list_val_files: async ({ valId, path = "", limit, offset }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
        );
      }

      try {
        const response = await client.vals.files.retrieve(valId, {
          path,
          recursive: true,
          ...(limit && { limit }),
          ...(offset && { offset }),
        });

        const files = Array.isArray(response) ? response : response.data || [];

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
    },

    get_file_content: async ({ valId, filePath }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    delete_file: async ({ valId, filePath }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    update_file_content: async ({ valId, filePath, content }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    write_file: async ({
      valId,
      filePath,
      content,
      name,
      type,
      parent_path,
    }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
        );
      }

      try {
        await client.vals.files.update(valId, {
          path: filePath,
          ...(content !== undefined && { content }),
          ...(name !== undefined && { name }),
          ...(type !== undefined && { type }),
          ...(parent_path !== undefined && { parent_path }),
        });

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
    },

    create_file: async ({ valId, filePath }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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
    },

    call_http_endpoint: async ({ valId, filePath, body, method = "POST" }) => {
      const client = await getValTownClient(auth, agentLoopContext);
      if (!client) {
        return new Err(
          new MCPError(API_KEY_NOT_CONFIGURED_ERROR, { tracked: false })
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

        const requestOptions: RequestInit = {
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
    },
  };

  return buildTools(VAL_TOWN_TOOLS_METADATA, handlers);
}
