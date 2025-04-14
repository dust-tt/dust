import { ArrowUpIcon, Button, cn, Input, Separator } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react";
import React from "react";

interface CoEditionBubbleMenuProps {
  editor: Editor;
  onAskAgentClick: (text: string) => Promise<void>;
}

export function CoEditionBubbleMenu({
  editor,
  onAskAgentClick,
}: CoEditionBubbleMenuProps) {
  const [isAskingAgent, setIsAskingAgent] = React.useState(false);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 200,
        onHide: () => {
          setIsAskingAgent(false);
        },
      }}
      className={cn(
        "border-2 border-border-dark p-1 dark:border-border-dark-night",
        "rounded-xl bg-background dark:bg-muted-background"
      )}
    >
      <div className="flex flex-row gap-1">
        {!isAskingAgent && (
          <div className="flex flex-row gap-0.5">
            <Button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive("bold") ? "is-active" : ""}
              label="Bold"
              size="xs"
              variant="ghost"
            />
            <Button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive("italic") ? "is-active" : ""}
              label="Italic"
              size="xs"
              variant="ghost"
            />
            <Button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive("strike") ? "is-active" : ""}
              label="Strike"
              size="xs"
              variant="ghost"
            />
            <Separator orientation="vertical" className="mx-1" />
          </div>
        )}
        <AskAgentInput
          editor={editor}
          onAskAgentClick={onAskAgentClick}
          isAskingAgent={isAskingAgent}
          setIsAskingAgent={setIsAskingAgent}
        />
      </div>
    </BubbleMenu>
  );
}

interface AskAgentInputProps {
  editor: Editor;
  isAskingAgent: boolean;
  onAskAgentClick: (text: string) => Promise<void>;
  setIsAskingAgent: (value: boolean) => void;
}

function AskAgentInput({
  editor,
  onAskAgentClick,
  isAskingAgent,
  setIsAskingAgent,
}: AskAgentInputProps) {
  const [text, setText] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleMessageSubmit = async () => {
    const currentSelection = editor.state.selection;
    const currentSelectionText = editor.state.doc.textBetween(
      currentSelection.from,
      currentSelection.to,
      ""
    );

    const message =
      `I'm working on this text: "${currentSelectionText}"\n\n` +
      `Selection: from position ${currentSelection.from} to ${currentSelection.to}\n\n` +
      `I need help with: ${text}`;

    await onAskAgentClick(message);
    setIsAskingAgent(false);
    setText("");
  };

  return (
    <div className="flex flex-row gap-1">
      {isAskingAgent ? (
        <div className="flex flex-row items-center gap-1">
          <Input
            ref={inputRef}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await handleMessageSubmit();
              }
            }}
            onChange={(e) => setText(e.target.value)}
            value={text}
            placeholder="What would you like help with?"
          />
          <Button
            size="mini"
            icon={ArrowUpIcon}
            variant="highlight"
            disabled={text.length === 0}
            onClick={handleMessageSubmit}
          />
        </div>
      ) : (
        <Button
          onClick={() => {
            setIsAskingAgent(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          label="Ask Agent"
          size="xs"
          variant="ghost"
        />
      )}
    </div>
  );
}
