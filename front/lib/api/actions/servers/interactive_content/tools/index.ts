import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { INTERACTIVE_CONTENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { fetchTemplateContent } from "@app/lib/api/actions/servers/interactive_content/template_utils";
import { DustFileSystem } from "@app/lib/api/file_system";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
  getClientExecutableFileShareUrl,
  renameClientExecutableFile,
  revertClientExecutableFileChanges,
} from "@app/lib/api/files/client_executable";
import { formatValidationWarningsForLLM } from "@app/lib/api/files/content_validation";
import { exportInteractiveContentFileAsPdf } from "@app/lib/api/files/pdf_export";
import { screenshotInteractiveContentFile } from "@app/lib/api/files/screenshot";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function createInteractiveContentTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<ToolDefinition[]> {
  const handlers: ToolHandlers<typeof INTERACTIVE_CONTENT_TOOLS_METADATA> = {
    create_interactive_content_file: async (
      { file_name, mime_type, mode, source, description },
      { sendNotification, _meta }
    ) => {
      const { runContext } = agentLoopContext ?? {};

      if (!runContext) {
        return new Err(
          new MCPError(
            "Agent loop context is required to use template nodes.",
            { tracked: false }
          )
        );
      }

      const { conversation, agentConfiguration } = runContext;

      let fileContent: string;

      if (mode === "template") {
        const templateResult = await fetchTemplateContent(auth, runContext, {
          templateRef: source,
        });

        if (templateResult.isErr()) {
          return templateResult;
        }

        fileContent = templateResult.value;
      } else {
        fileContent = source;
      }

      const result = await createClientExecutableFile(auth, {
        content: fileContent,
        conversationId: conversation.sId,
        fileName: file_name,
        mimeType: mime_type,
        createdByAgentConfigurationId: agentConfiguration?.sId,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const { fileResource, warnings } = result.value;

      let responseText = description
        ? `File '${fileResource.sId}' created successfully. ${description}`
        : `File '${fileResource.sId}' created successfully.`;

      responseText += formatValidationWarningsForLLM(warnings);

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Creating interactive file..."
          );

        // Send a notification to the MCP Client, to display the interactive file.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "resource",
          resource: {
            contentType: fileResource.contentType,
            fileId: fileResource.sId,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            snippet: fileResource.snippet,
            text: responseText,
            title: fileResource.fileName,
            uri: fileResource.getPublicUrl(auth),
          },
        },
      ]);
    },

    edit_interactive_content_file: async (
      { file_id, old_string, new_string, expected_replacements },
      { sendNotification, _meta }
    ) => {
      const { agentConfiguration } = agentLoopContext?.runContext ?? {};

      const result = await editClientExecutableFile(auth, {
        fileId: file_id,
        oldString: old_string,
        newString: new_string,
        expectedReplacements: expected_replacements,
        editedByAgentConfigurationId: agentConfiguration?.sId,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const {
        fileResource,
        replacementCount,
        warnings,
        referencedFilesChangeNotice,
      } = result.value;

      const pluralS = replacementCount === 1 ? "" : "s";
      let responseText =
        `File '${fileResource.sId}' updated successfully. Made ` +
        `${replacementCount} replacement${pluralS}`;

      responseText += formatValidationWarningsForLLM(warnings);
      if (referencedFilesChangeNotice) {
        responseText += referencedFilesChangeNotice;
      }

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Updating Interactive Content file..."
          );

        // Send a notification to the MCP Client, to refresh the Interactive Content file.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: responseText,
        },
      ]);
    },

    revert_interactive_content_file: async (
      { file_id },
      { sendNotification, _meta }
    ) => {
      if (!agentLoopContext?.runContext) {
        throw new Error(
          "Could not access Agent Loop Context from revert Interactive Content file tool."
        );
      }

      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await revertClientExecutableFileChanges(auth, {
        fileId: file_id,
        revertedByAgentConfigurationId: agentConfiguration.sId,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const {
        value: { fileResource },
      } = result;

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Reverting Interactive Content file..."
          );

        // Send a notification to the MCP Client, to refresh the Interactive Content file.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: `File '${fileResource.sId}' reverted successfully.`,
        },
      ]);
    },

    rename_interactive_content_file: async (
      { file_id, new_file_name },
      { sendNotification, _meta }
    ) => {
      const { agentConfiguration } = agentLoopContext?.runContext ?? {};

      const result = await renameClientExecutableFile(auth, {
        fileId: file_id,
        newFileName: new_file_name,
        renamedByAgentConfigurationId: agentConfiguration?.sId,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const fileResource = result.value;

      const responseText = `File '${fileResource.sId}' renamed successfully to '${fileResource.fileName}'.`;

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Renaming interactive file..."
          );

        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: responseText,
        },
      ]);
    },

    retrieve_interactive_content_file: async ({ file_id }) => {
      const result = await getClientExecutableFileContent(auth, file_id);
      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const { fileResource, content } = result.value;

      return new Ok([
        {
          type: "text",
          text:
            `File '${fileResource.sId}' (${fileResource.fileName}) retrieved ` +
            `successfully. Content:\n\n${content}`,
        },
      ]);
    },

    get_interactive_content_file_share_url: async ({ file_id }) => {
      const shareUrlRes = await getClientExecutableFileShareUrl(auth, file_id);
      if (shareUrlRes.isErr()) {
        return new Err(new MCPError(shareUrlRes.error.message));
      }

      return new Ok([
        {
          type: "text",
          text: `URL: ${shareUrlRes.value}`,
        },
      ]);
    },

    export_interactive_content_file: async ({
      file_id,
      format,
      orientation,
    }) => {
      switch (format) {
        case "pdf": {
          const result = await exportInteractiveContentFileAsPdf(auth, {
            fileId: file_id,
            orientation,
          });
          if (result.isErr()) {
            return new Err(
              new MCPError(result.error.message, { tracked: false })
            );
          }
          return new Ok([
            {
              type: "resource",
              resource: {
                uri: result.value.fileName,
                mimeType: "application/pdf",
                blob: result.value.buffer.toString("base64"),
              },
            },
          ]);
        }
        case "png": {
          const result = await screenshotInteractiveContentFile(auth, {
            fileId: file_id,
          });
          if (result.isErr()) {
            return new Err(
              new MCPError(result.error.message, { tracked: false })
            );
          }
          return new Ok([
            {
              type: "image",
              data: result.value.buffer.toString("base64"),
              mimeType: "image/png",
            },
          ]);
        }
        default:
          assertNever(format);
      }
    },

    publish_interactive_content_file: async (
      { file_id, path },
      { sendNotification, _meta }
    ) => {
      const { agentConfiguration } = agentLoopContext?.runContext ?? {};

      const file = await FileResource.fetchById(auth, file_id);
      if (!file) {
        return new Err(
          new MCPError(`Frame not found: ${file_id}`, { tracked: false })
        );
      }

      if (!file.isInteractiveContent) {
        return new Err(
          new MCPError(
            `File '${file_id}' is not a Frame (content type: ${file.contentType}).`,
            { tracked: false }
          )
        );
      }

      // Resolve the Computer mount that holds the Frame's source files.
      const fsResult = await DustFileSystem.fromScopedPath(auth, path);
      if (fsResult.isErr()) {
        return new Err(
          new MCPError(fsResult.error.message, { tracked: false })
        );
      }

      const result = await publishFrame(auth, {
        file,
        reader: createMountFrameSourceReader(fsResult.value, path),
        rootScopedPath: path,
        publishedByAgentConfigurationId: agentConfiguration?.sId,
      });
      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.code === "internal",
          })
        );
      }

      let responseText = `Frame '${file.sId}' published successfully.`;
      responseText += formatValidationWarningsForLLM(result.value.warnings);

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            file,
            "Publishing Frame..."
          );

        // Notify the MCP client to refresh the now-republished Frame.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: responseText,
        },
      ]);
    },
  };

  const tools = buildTools(INTERACTIVE_CONTENT_TOOLS_METADATA, handlers);

  // Publishing a Frame's edited source tree into the rendered bundle is gated behind frame_publish.
  const flags = await getFeatureFlags(auth);
  if (flags.includes("frame_publish")) {
    return tools;
  }

  return tools.filter(
    (tool) => tool.name !== "publish_interactive_content_file"
  );
}
