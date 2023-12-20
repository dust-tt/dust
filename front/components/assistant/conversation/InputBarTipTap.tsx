// import "./styles.scss";

import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
  IconButton,
} from "@dust-tt/sparkle";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React, { useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { classNames } from "@app/lib/utils";

import { makeGetAssistantSuggestions } from "./suggestion.js";

const Tiptap = (props: any) => {
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

  const editor = useEditor({
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
        suggestion: makeGetAssistantSuggestions(props.assistants),
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
  });

  // TODO: Reset after loading.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 py-1.5",
    "whitespace-pre-wrap font-normal"
  );

  console.log(">> selectedAssistant:", props.selectedAssistant);

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
