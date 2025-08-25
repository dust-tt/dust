import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { ConversationType } from "@app/types";
import { isAgentMessageType } from "@app/types";

export function listGeneratedFiles(
  conversation: ConversationType
): Array<ActionGeneratedFileType> {
  const files: Array<ActionGeneratedFileType> = [];

  for (const versions of conversation.content) {
    const message = versions[versions.length - 1];

    if (isAgentMessageType(message)) {
      const generatedFiles = message.actions.flatMap((action) =>
        action.getGeneratedFiles()
      );

      for (const file of generatedFiles) {
        files.push({
          fileId: file.fileId,
          title: file.title,
          contentType: file.contentType,
          snippet: file.snippet,
        });
      }
    }
  }

  return files;
}
