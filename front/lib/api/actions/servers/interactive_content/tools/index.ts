import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import {
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
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
import { FileResource } from "@app/lib/resources/file_resource";
import { splitFrameEntryScopedPath } from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";

export async function createInteractiveContentTools(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<ToolDefinition[]> {
  const handlers: ToolHandlers<typeof INTERACTIVE_CONTENT_TOOLS_METADATA> = {
    create_interactive_content_file: async (
      { file_name, mime_type, mode, source, description },
      { sendNotification, _meta }
    ) => {
      // TODO: enable create and publish to be conversation agnostic for both templates (local) and
      //       createClientExecutablefile direclty on pod DFS so that we can re-enable this server
      //       when run without conversation context.
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const { conversation, agentConfiguration } = toolContext.runContext;

      let fileContent: string;

      if (mode === "template") {
        const templateResult = await fetchTemplateContent(
          auth,
          toolContext.runContext,
          {
            templateRef: source,
          }
        );

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
      const { agentConfiguration } = isAgentLoopRunContext(
        toolContext?.runContext
      )
        ? toolContext?.runContext
        : {};

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
      if (!isAgentLoopRunContext(toolContext?.runContext)) {
        throw new Error(
          "Could not access Agent Loop Context from revert Interactive Content file tool."
        );
      }

      const { agentConfiguration } = toolContext.runContext;

      const result = await revertClientExecutableFileChanges(auth, {
        fileId: file_id,
        revertedByAgentConfigurationId: agentConfiguration?.sId,
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
      const { agentConfiguration } = isAgentLoopRunContext(
        toolContext?.runContext
      )
        ? toolContext?.runContext
        : {};

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
      const { agentConfiguration } = isAgentLoopRunContext(
        toolContext?.runContext
      )
        ? toolContext?.runContext
        : {};

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

      const splitResult = splitFrameEntryScopedPath(path);
      if (splitResult.isErr()) {
        return new Err(
          new MCPError(splitResult.error.message, { tracked: false })
        );
      }
      const { root, entryRelPath } = splitResult.value;

      const fsResult = await DustFileSystem.fromScopedPath(auth, root);
      if (fsResult.isErr()) {
        return new Err(
          new MCPError(fsResult.error.message, { tracked: false })
        );
      }

      const result = await publishFrame(auth, {
        file,
        reader: createMountFrameSourceReader(fsResult.value, root),
        entryRelPath,
        rootScopedPath: root,
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

  // The file-id edit tool is deprecated in favor of editing the Frame's mounted source by path
  // with the files server, then publishing. Conversations without the file system (created
  // before it defaulted on) have no path tools, so they keep it.
  //
  // The file-id retrieve tool stays everywhere, including file-system conversations: unlike
  // edit, it reads the canonical original directly by FileResource id rather than through the
  // mount, so it still works for a Frame whose mountFilePath hasn't been resolved (e.g. one
  // predating the mount system that has not gone through the backfill). The path-based files
  // tools have no fallback for that case (files.resolve and the mount read both require
  // mountFilePath to be set), so removing retrieve would leave such a Frame unreadable.
  const { runContext } = toolContext ?? {};
  const conversation = isAgentLoopRunContext(runContext)
    ? runContext.conversation
    : toolContext?.listToolsContext?.conversation;
  if (conversation?.metadata?.useFileSystem === true) {
    return tools.filter(
      (tool) => tool.name !== EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
  }

  return tools;
}
