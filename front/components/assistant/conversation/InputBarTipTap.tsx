// import "./styles.scss";

import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
  IconButton,
} from "@dust-tt/sparkle";
import { AgentMention } from "@dust-tt/types";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Editor, EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React, { useEffect, useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { compareAgentsForSort } from "@app/lib/assistant";
import { useAgentConfigurations } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

import { makeGetAssistantSuggestions } from "./suggestion";
import useAssistantSuggestions from "./useAssistantSuggestions";

interface RawMention {
  id: string;
  name: string;
}

// function maybeInsertMentions(editor: Editor | null, rawMentions: RawMention[]) {
//   if (!editor || rawMentions.length === 0) {
//     return;
//   }

//   console.log(">> rawMentions:", JSON.stringify(rawMentions, null, 2));

//   const chainCommands = editor?.chain();

//   for (const raw of rawMentions) {
//     chainCommands
//       .insertContent({
//         type: "mention",
//         attrs: {
//           id: raw.id,
//           label: raw.name,
//         },
//       })
//       .insertContent(" "); // Add an extra space after the mention.
//   }

//   chainCommands.run();
// }

const Tiptap = (props: any) => {
  console.log(">> TipTap <<");
  const stickyMentionsTextContent = useRef<string | null>(null);

  // const suggestions = useAssistantSuggestions(
  //   props.owner,
  //   props.conversationId
  // );

  // console.log(">> suggestions:", suggestions);

  // REMOVE:

  const { owner, conversationId } = props;
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  // Transform the assistants data into the format expected by Mention plugin
  const suggestions = activeAgents.map((agent) => ({
    sId: agent.sId,
    pictureUrl: agent.pictureUrl,
    name: agent.name,
  }));

  // Consider:
  // StarterKit.configure({
  //   history: false,
  // }),

  // const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  // activeAgents.sort(compareAgentsForSort);

  // TODO: Should we keep this here?
  const [isExpanded, setIsExpanded] = useState(false);

  const PreventEnter = Extension.create({
    addKeyboardShortcuts(this) {
      const { editor } = this;

      return {
        Enter: () => {
          props.onCTAClick(editor.getJSON(), () => {
            editor.commands.setContent("");
            setIsExpanded(false);
          });

          return true;
        },
      };
    },
  });

  // TODO: Update suggestion when assistants is loaded!

  const editor = useEditor(
    {
      enableInputRules: false, // Disable Markdown when typing.
      enablePasteRules: false, // Disable Markdown when pasting.
      extensions: [
        StarterKit.configure({}),
        PreventEnter,
        Mention.configure({
          HTMLAttributes: {
            class:
              "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium",
          },
          suggestion: makeGetAssistantSuggestions(suggestions),
        }),
        Placeholder.configure({
          placeholder: "Ask a question or get some @help",
          emptyNodeClass:
            "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none",
        }),
      ],
      editorProps: {
        attributes: {
          class: "border-0 outline-none overflow-y-auto h-full",
        },
      },
      // TODO: Should we consider using slotBefore/slotAfter?
    },
    [agentConfigurations]
  );

  const { stickyMentions, selectedAssistant } = props;
  useEffect(() => {
    if (!stickyMentions?.length && !selectedAssistant) {
      return;
    }

    const mentionsToInject = stickyMentions?.length
      ? stickyMentions
      : ([selectedAssistant] as [AgentMention]);

    const mentionedAgentConfigurationIds = new Set(
      mentionsToInject?.map((m) => m.configurationId)
    );

    if (editor) {
      // const textContent = editor.get.textContent?.trim();

      const isNotEmpty = !editor.isEmpty;
      if (isNotEmpty && !stickyMentionsTextContent.current) {
        return;
      }

      if (
        isNotEmpty &&
        editor.getText() !== stickyMentionsTextContent.current
      ) {
        // content has changed, we don't clear it (we preserve whatever the user typed)
        return;
      }

      // we clear the content of the input bar -- at this point, it's either already empty,
      // or contains only the sticky mentions added by this hook
      editor.commands.setContent("");
      const lastTextNode = null;
      for (const configurationId of mentionedAgentConfigurationIds) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (!agentConfiguration) {
          continue;
        }

        console.log(">> hello <<", agentConfiguration);

        editor
          ?.chain()
          .focus()
          .insertContent({
            type: "mention",
            attrs: {
              id: agentConfiguration.sId,
              label: agentConfiguration.name,
            },
          })
          .insertContent(" ") // add an extra space after the mention
          .run();
        // const mentionNode = getAgentMentionNode(agentConfiguration);
        // if (!mentionNode) {
        //   continue;
        // }

        stickyMentionsTextContent.current = editor.getText().trim() || null;
      }
      // move the cursor to the end of the input bar
      if (lastTextNode) {
        editor.commands.focus("end");
      }
    }
  }, [
    stickyMentions,
    agentConfigurations,
    stickyMentionsTextContent,
    selectedAssistant,
    editor,
  ]);

  // TODO: Reset after loading.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 py-1.5",
    "whitespace-pre-wrap font-normal"
  );

  // maybeInsertMentions(editor, props.stickyMentionsToInject);

  return (
    <div className="flex w-full flex-1 whitespace-pre-wrap border-0 py-2 pl-2 pr-1 font-normal outline-none ring-0 scrollbar-hide focus:border-0 focus:outline-none focus:ring-0 sm:pl-0">
      <EditorContent
        editor={editor}
        className={classNames(
          contentEditableClasses,
          "scrollbar-hide",
          "overflow-y-auto",
          isExpanded
            ? "h-[60vh] max-h-[60vh] lg:h-[80vh] lg:max-h-[80vh]"
            : "max-h-64"
        )}
      />

      <div className="flex flex-row items-end justify-between gap-2 self-stretch border-t border-structure-100 pr-1 sm:flex-col sm:border-0">
        <div className="flex gap-5 rounded-full border border-structure-100 px-4 py-2 sm:gap-3 sm:px-2">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            // Move this code to the parent callsite.
            onChange={(event) => {
              props.onInputFileChange(event);
            }}
          />
          <IconButton
            variant={"tertiary"}
            icon={AttachmentIcon}
            size="sm"
            disabled={props.disableAttachment}
            tooltip="Add a document to the conversation (10MB maximum, only .txt, .pdf, .md)."
            tooltipPosition="above"
            className="flex"
            onClick={() => {
              fileInputRef.current?.click();
            }}
          />
          <AssistantPicker
            owner={props.owner}
            size="sm"
            onItemClick={(c) => {
              editor
                ?.chain()
                .focus()
                .insertContent({
                  type: "mention",
                  attrs: {
                    id: c.sId,
                    label: c.name,
                  },
                })
                .insertContent(" ") // add an extra space after the mention
                .run();
            }}
            assistants={props.assistants}
            showBuilderButtons={true}
          />
          <div className="hidden sm:flex">
            <IconButton
              variant={"tertiary"}
              icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
              size="sm"
              className="flex"
              onClick={() => {
                setIsExpanded((event) => !event);
                // Focus on the end!
                editor?.commands.focus("end");
              }}
            />
          </div>
        </div>
        <Button
          size="sm"
          icon={ArrowUpIcon}
          label="Send"
          disabled={editor?.isEmpty}
          labelVisible={false}
          disabledTooltip
          onClick={async () => {
            await props.onCTAClick(editor?.getJSON(), () => {
              editor?.commands.setContent("");
              setIsExpanded(false);
            });
          }}
        />
      </div>
    </div>
  );
};

export default Tiptap;
