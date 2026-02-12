import {
  ArrowUpIcon,
  AttachmentIcon,
  BoltIcon,
  Button,
  cn,
  MicIcon,
  PlusIcon,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";

interface InputBarProps {
  placeholder?: string;
  className?: string;
  instructionReference?: { start: number; end: number } | null;
  onInstructionInserted?: () => void;
}

export function InputBar({
  placeholder = "Ask a question",
  className,
  instructionReference,
  onInstructionInserted,
}: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const richTextAreaRef = useRef<RichTextAreaHandle | null>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  useEffect(() => {
    if (!instructionReference) {
      return;
    }

    const { start, end } = instructionReference;
    const label = `Snippet (${start}-${end})`;
    richTextAreaRef.current?.insertInstructionSnippet({
      id: `instruction-${start}-${end}`,
      label,
    });
    onInstructionInserted?.();
  }, [instructionReference, onInstructionInserted]);

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      className={cn(
        "s-relative s-w-full s-max-w-4xl s-z-10",
        "s-rounded-3xl s-border s-bg-primary-50/70 s-backdrop-blur-md s-transition-all",
        isFocused
          ? "s-border-highlight-300 s-ring-2 s-ring-highlight-300/50"
          : "s-border-border",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        <RichTextArea
          ref={richTextAreaRef}
          placeholder={placeholder}
          onFocus={handleFocus}
          variant="compact"
          showFormattingMenu
          showAskCopilotMenu={false}
          className="s-placeholder:s-text-muted-foreground"
        />
        <div className="s-flex s-w-full s-gap-2 s-p-2 s-pl-4">
          <Button
            variant="outline"
            icon={PlusIcon}
            size="sm"
            tooltip="Attach a document"
            className="md:s-hidden"
          />
          <div className="s-hidden s-gap-0 md:s-flex">
            <Button
              variant="ghost-secondary"
              icon={AttachmentIcon}
              size="xs"
              tooltip="Attach a document"
            />
            <Button
              variant="ghost-secondary"
              icon={BoltIcon}
              size="xs"
              tooltip="Add functionality"
            />
            <Button
              variant="ghost-secondary"
              icon={RobotIcon}
              size="xs"
              tooltip="Mention an Agent"
            />
          </div>
          <div className="s-grow" />
          <div className="s-flex s-items-center s-gap-2 md:s-gap-1">
            <Button
              variant="ghost-secondary"
              icon={MicIcon}
              size="xs"
              isRounded
            />
            <Button
              variant="highlight"
              icon={ArrowUpIcon}
              size="xs"
              tooltip="Send message"
              isRounded
            />
          </div>
        </div>
      </div>
    </div>
  );
}
