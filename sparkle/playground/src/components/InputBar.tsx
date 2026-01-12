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

interface InputBarProps {
  placeholder?: string;
  className?: string;
}

export function InputBar({
  placeholder = "Ask a question",
  className,
}: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      className={cn(
        "s-relative s-w-full s-max-w-3xl",
        "s-rounded-3xl s-border s-bg-primary-50 s-transition-all",
        isFocused
          ? "s-border-highlight-300 s-ring-2 s-ring-highlight-300/50"
          : "s-border-border",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          onFocus={handleFocus}
          className="s-placeholder:s-text-muted-foreground s-h-full s-w-full s-resize-none s-border-0 s-bg-transparent s-p-5 s-text-foreground s-outline-none focus:s-outline-none focus:s-ring-0"
          rows={1}
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
