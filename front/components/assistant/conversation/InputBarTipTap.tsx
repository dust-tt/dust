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

import InputBarEditorContent from "./inputBarEditorContent";
import { makeGetAssistantSuggestions } from "./suggestion";
import useAssistantSuggestions from "./useAssistantSuggestions";
import useCustomEditor from "./useCustomEditor";
import useHandleMentions from "./useHandleMentions";

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

const InputBarContainer = (props: any) => {
  // REMOVE:
  const { owner, conversationId } = props;
  const suggestions = useAssistantSuggestions(props.agentConfigurations);
  // Consider:
  // StarterKit.configure({
  //   history: false,
  // }),

  const { onEnterKeyDown } = props;
  const editor = useCustomEditor(suggestions, onEnterKeyDown);

  // Use the custom hook to handle mentions
  const { stickyMentions, selectedAssistant } = props;
  useHandleMentions(
    editor,
    owner,
    conversationId,
    stickyMentions,
    selectedAssistant
  );

  // TODO: Reset after loading.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 py-1.5",
    "whitespace-pre-wrap font-normal"
  );

  const [isExpanded, setIsExpanded] = useState(false);

  function handleExpansionToggle() {
    setIsExpanded((currentExpanded) => !currentExpanded);

    // If the editor exists, focus at the end of the document when toggling expansion
    if (editor) {
      editor.commands.focus("end");
    }
  }

  return (
    <div className="flex w-full flex-1 whitespace-pre-wrap border-0 py-2 pl-2 pr-1 font-normal outline-none ring-0 scrollbar-hide focus:border-0 focus:outline-none focus:ring-0 sm:pl-0">
      <InputBarEditorContent
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
            assistants={props.allMentions}
            showBuilderButtons={true}
          />
          <div className="hidden sm:flex">
            <IconButton
              variant={"tertiary"}
              icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
              size="sm"
              className="flex"
              onClick={handleExpansionToggle}
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
            await onEnterKeyDown(editor?.getJSON(), () => {
              editor?.commands.setContent("");
              setIsExpanded(false);
            });
          }}
        />
      </div>
    </div>
  );
};

export default InputBarContainer;
