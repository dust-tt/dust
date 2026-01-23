import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getWritableProjectContext,
  makeSuccessResponse,
  withErrorHandling,
} from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Err, Ok } from "@app/types";

export const EDIT_PROJECT_DESCRIPTION_TOOL_NAME = "edit_project_description";
export const ADD_PROJECT_URL_TOOL_NAME = "add_project_url";
export const EDIT_PROJECT_URL_TOOL_NAME = "edit_project_url";

/**
 * Gets or creates project metadata for a space.
 */
async function getOrCreateProjectMetadata(
  auth: Authenticator,
  space: SpaceResource,
  initialData: {
    description?: string | null;
    urls?: { name: string; url: string }[];
  }
): Promise<ProjectMetadataResource> {
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

  if (metadata) {
    return metadata;
  }

  return ProjectMetadataResource.makeNew(auth, space, {
    description: initialData.description ?? null,
    urls: initialData.urls ?? [],
  });
}

/**
 * Registers the edit_project_description tool.
 */
export function registerEditProjectDescriptionTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
    "Edit the project description. This updates the project's description text.",
    {
      description: z
        .string()
        .describe("New project description (free-form text)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return withErrorHandling(async () => {
          const contextRes = await getWritableProjectContext(
            auth,
            agentLoopContext
          );
          if (contextRes.isErr()) {
            return contextRes;
          }

          const { space } = contextRes.value;
          const { description } = params;

          // Fetch or create project metadata.
          const metadata = await ProjectMetadataResource.fetchBySpace(
            auth,
            space
          );

          if (!metadata) {
            // Create metadata if it doesn't exist.
            await ProjectMetadataResource.makeNew(auth, space, {
              description,
              urls: [],
            });
          } else {
            // Update existing metadata.
            const updateRes = await metadata.updateMetadata({ description });
            if (updateRes.isErr()) {
              return new Err(
                new MCPError(
                  `Failed to update project description: ${updateRes.error.message}`,
                  { tracked: false }
                )
              );
            }
          }

          return new Ok(
            makeSuccessResponse({
              success: true,
              description,
              message: "Project description updated successfully.",
            })
          );
        }, "Failed to edit project description");
      }
    )
  );
}

/**
 * Registers the add_project_url tool.
 */
export function registerAddProjectUrlTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    ADD_PROJECT_URL_TOOL_NAME,
    "Add a new URL to the project. URLs are named links (e.g., documentation, repository, design files).",
    {
      name: z
        .string()
        .describe("Name/label for the URL (e.g., 'Documentation')"),
      url: z.string().describe("The URL to add"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ADD_PROJECT_URL_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return withErrorHandling(async () => {
          const contextRes = await getWritableProjectContext(
            auth,
            agentLoopContext
          );
          if (contextRes.isErr()) {
            return contextRes;
          }

          const { space } = contextRes.value;
          const { name, url } = params;

          // Fetch or create project metadata.
          const metadata = await getOrCreateProjectMetadata(auth, space, {
            urls: [{ name, url }],
          });

          // If metadata was just created, the URL is already added.
          // Otherwise, add the URL to existing URLs.
          if (metadata.urls.length === 0 || metadata.urls[0].name !== name) {
            const updatedUrls = [...metadata.urls, { name, url }];
            const updateRes = await metadata.updateMetadata({
              urls: updatedUrls,
            });
            if (updateRes.isErr()) {
              return new Err(
                new MCPError(
                  `Failed to add project URL: ${updateRes.error.message}`,
                  { tracked: false }
                )
              );
            }
          }

          return new Ok(
            makeSuccessResponse({
              success: true,
              name,
              url,
              message: `URL "${name}" added to project successfully.`,
            })
          );
        }, "Failed to add project URL");
      }
    )
  );
}

/**
 * Registers the edit_project_url tool.
 */
export function registerEditProjectUrlTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    EDIT_PROJECT_URL_TOOL_NAME,
    "Edit an existing URL in the project. You can change the name and/or the URL itself. " +
      "Identify the URL to edit by its current name.",
    {
      currentName: z.string().describe("Current name/label of the URL to edit"),
      newName: z
        .string()
        .optional()
        .describe("New name/label for the URL (leave empty to keep current)"),
      newUrl: z
        .string()
        .optional()
        .describe("New URL value (leave empty to keep current)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: EDIT_PROJECT_URL_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return withErrorHandling(async () => {
          const contextRes = await getWritableProjectContext(
            auth,
            agentLoopContext
          );
          if (contextRes.isErr()) {
            return contextRes;
          }

          const { space } = contextRes.value;
          const { currentName, newName, newUrl } = params;

          // Validate at least one field is being updated.
          if (!newName && !newUrl) {
            return new Err(
              new MCPError(
                "At least one of newName or newUrl must be provided",
                { tracked: false }
              )
            );
          }

          // Fetch project metadata.
          const metadata = await ProjectMetadataResource.fetchBySpace(
            auth,
            space
          );

          if (!metadata) {
            return new Err(
              new MCPError("No project metadata found", { tracked: false })
            );
          }

          // Find the URL to edit.
          const existingUrls = metadata.urls;
          const urlIndex = existingUrls.findIndex(
            (item) => item.name === currentName
          );

          if (urlIndex === -1) {
            return new Err(
              new MCPError(`URL with name "${currentName}" not found`, {
                tracked: false,
              })
            );
          }

          // Update the URL without mutating the original array.
          const updatedUrls = existingUrls.map((item, index) =>
            index === urlIndex
              ? {
                  name: newName ?? item.name,
                  url: newUrl ?? item.url,
                }
              : item
          );

          const updateRes = await metadata.updateMetadata({
            urls: updatedUrls,
          });
          if (updateRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to edit project URL: ${updateRes.error.message}`,
                { tracked: false }
              )
            );
          }

          return new Ok(
            makeSuccessResponse({
              success: true,
              oldName: currentName,
              newName: newName ?? currentName,
              newUrl: newUrl ?? "unchanged",
              message: `URL "${currentName}" updated successfully.`,
            })
          );
        }, "Failed to edit project URL");
      }
    )
  );
}

/**
 * Registers all metadata-related tools on the server.
 */
export function registerMetadataTools(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  registerEditProjectDescriptionTool(server, auth, agentLoopContext);
  registerAddProjectUrlTool(server, auth, agentLoopContext);
  registerEditProjectUrlTool(server, auth, agentLoopContext);
}
