import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { ConversationType } from "@app/types";
import { isAgentMessageType } from "@app/types";

export function listGeneratedFiles(
  conversation: ConversationType
): ActionGeneratedFileType[] {
  const files: ActionGeneratedFileType[] = [];

  for (const versions of conversation.content) {
    const message = versions[versions.length - 1];

    if (isAgentMessageType(message)) {
      const generatedFiles = message.actions.flatMap(
        (action) => action.generatedFiles
      );

      files.push(
        ...generatedFiles.filter((generatedFile) => !generatedFile.hidden)
      );
    }
  }

  return files;
}
