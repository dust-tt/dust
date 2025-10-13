import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  XMarkIcon,
} from "@dust-tt/sparkle";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from "react";

import { CoEditionBubbleMenu } from "@app/components/assistant/conversation/co_edition/CoEditionBubbleMenu";
import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { CoEditionCopyButton } from "@app/components/assistant/conversation/co_edition/CopyButton";
import { BlockIdExtension } from "@app/components/assistant/conversation/co_edition/extensions/BlockIdExtension";
import { CoEditionParagraphExtension } from "@app/components/assistant/conversation/co_edition/extensions/CoEditionParagraphExtension";
import { CoEditionStyleExtension } from "@app/components/assistant/conversation/co_edition/extensions/CoEditionStyleExtension";
import { FileImageExtension } from "@app/components/assistant/conversation/co_edition/extensions/FileImageExtension";
import { makeLinkExtension } from "@app/components/assistant/conversation/co_edition/extensions/LinkExtension";
import { UserContentMark } from "@app/components/assistant/conversation/co_edition/marks/UserContentMark";
import { insertNodes } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";
import { submitMessage } from "@app/components/assistant/conversation/lib";
import { useConversationParticipants } from "@app/lib/swr/conversations";
import { emptyArray } from "@app/lib/swr/swr";
import type {
  ConversationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";
import { removeNulls } from "@app/types";

interface CoEditionContainerProps {
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
  user: UserType;
}

export function CoEditionContainer({
  conversation,
  owner,
  user,
}: CoEditionContainerProps) {
  const { closeCoEdition, server, serverId } = useCoEditionContext();

  const { conversationParticipants } = useConversationParticipants({
    conversationId: conversation?.sId ?? "",
    workspaceId: owner.sId,
  });
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          paragraph: false,
        }),
        CoEditionParagraphExtension,
        UserContentMark,
        CoEditionStyleExtension,
        BlockIdExtension.configure({
          types: [
            "blockquote",
            "bulletList",
            "codeBlock",
            "heading",
            "listItem",
            "orderedList",
            "paragraph",
            "pre",
          ],
          attributeName: "data-id",
        }),
        FileImageExtension.configure({
          workspaceId: owner.sId,
        }),
        makeLinkExtension(),
        Placeholder.configure({
          placeholder: "Write something...",
          emptyNodeClass: cn(
            "first:before:text-muted-foreground first:before:float-left",
            "first:before:content-[attr(data-placeholder)]",
            "first:before:pointer-events-none first:before:h-0"
          ),
        }),
      ],
    },
    [owner.sId]
  );

  const undo = React.useCallback(() => {
    if (editor) {
      editor.chain().focus().undo().run();
    }
  }, [editor]);

  const redo = React.useCallback(() => {
    if (editor) {
      editor.chain().focus().redo().run();
    }
  }, [editor]);

  const postMessage = React.useCallback(
    async (text: string) => {
      if (conversation) {
        const messageData = {
          contentFragments: {
            contentNodes: [],
            uploaded: [],
          },
          input: text,
          clientSideMCPServerIds: removeNulls([serverId]),
          mentions:
            // This is best-effort, we mentions all agents participating in the conversation.
            conversationParticipants?.agents.map((a) => ({
              configurationId: a.configurationId,
            })) ?? emptyArray(),
        };

        const result = await submitMessage({
          owner,
          user,
          conversationId: conversation.sId,
          messageData,
        });

        if (result.isErr()) {
          console.error(result.error);
        }
      }
    },
    [conversation, conversationParticipants, serverId, owner, user]
  );

  editor?.setOptions({
    editorProps: {
      attributes: {
        class: "border-0 outline-none overflow-y-auto h-full scrollbar-hide",
      },
      handleKeyDown: () => {
        // On any user input, wrap the current selection in UserContentMark.
        // TODO(2025-04-10, flav): Narrow down to only changes.
        editor.commands.setMark("userContent");
      },
    },
  });

  // Set the editor in the server when it's ready.
  React.useEffect(() => {
    if (editor && server) {
      server.setEditor(editor);
    }
  }, [editor, server]);

  // Apply initial nodes when they're available and co-edition is enabled.
  React.useEffect(() => {
    const state = server?.getState();
    if (
      editor &&
      state &&
      state.isEnabled &&
      state.initialNodes &&
      state.initialNodes.length > 0
    ) {
      // Apply initial nodes with agent marking.
      insertNodes(editor, state.initialNodes);

      // Clear the initial nodes from state.
      if (server) {
        server.clearInitialNodes();
      }
    }
  }, [editor, server]);

  return (
    <div className="flex h-full flex-col bg-muted-background dark:bg-muted-background-night">
      <div className="flex flex-row justify-between p-2">
        <div className="flex flex-row gap-2">
          <Button
            icon={ChevronLeftIcon}
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!editor?.can().undo()}
          />
          <Button
            icon={ChevronRightIcon}
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!editor?.can().redo()}
          />
          <CoEditionCopyButton editor={editor} />
        </div>
        <Button
          icon={XMarkIcon}
          variant="ghost"
          size="sm"
          onClick={closeCoEdition}
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {editor && (
          <CoEditionBubbleMenu editor={editor} onAskAgentClick={postMessage} />
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
