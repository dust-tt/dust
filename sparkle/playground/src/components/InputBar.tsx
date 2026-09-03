import {
  ArrowUp,
  Attachment01,
  Avatar,
  BarHalf,
  Button,
  cn,
  File02,
  Icon,
  Image01,
  ImageZoomDialog,
  Microphone01,
  Plus,
  Robot,
  ShapesPlus,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tool02,
  VoicePicker,
  XClose,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ContextUsageIndicator } from "./ContextUsageIndicator";

import {
  NewCitation,
  NewCitationGrid,
  type NewCitationProps,
} from "./NewCitation";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";
import { TaskItem } from "./TaskItem";

type DroppedFile = { id: string; file: File; objectUrl?: string };

export type InputBarTaskCommand = {
  id: string;
  label: string;
  contextAttachments?: Array<{
    id: string;
    label: string;
    tooltip?: string;
    visual?: NewCitationProps["visual"];
  }>;
};

interface InputBarProps {
  placeholder?: string;
  className?: string;
  instructionReference?: { start: number; end: number } | null;
  taskCommand?: InputBarTaskCommand | null;
  variant?: "default" | "embedded";
  onInstructionInserted?: () => void;
  onClose?: () => void;
  /** Receives the composer's text; the composer is cleared after it fires. */
  onSend?: (text: string) => void;
  /**
   * "production" reproduces front's input bar: the `rounded-2xl
   * bg-muted-background` box from `InputBar.tsx` and the toolbar row from
   * `InputBarButtons.tsx` (agent pill, model picker, capabilities, attachment
   * on the left; context-usage gauge, voice, round send on the right).
   */
  toolbarStyle?: "playground" | "production";
  /** Agent pill shown in the production toolbar. */
  agent?: { name: string; emoji?: string; backgroundColor?: string };
  /** Renders the context-usage gauge in the production toolbar when set. */
  contextUsagePercentage?: number;
  /**
   * Slot above the composer box, inside the input-bar wrapper. This is where
   * production mounts the usage banner and the plan pill.
   */
  aboveComposer?: ReactNode;
}

export function InputBar({
  placeholder = "Get work done",
  className,
  instructionReference,
  taskCommand,
  variant = "default",
  onInstructionInserted,
  onClose,
  onSend,
  toolbarStyle = "playground",
  agent,
  contextUsagePercentage,
  aboveComposer,
}: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
  const [dismissedContextAttachmentIds, setDismissedContextAttachmentIds] =
    useState<Set<string>>(new Set());
  const [selectedDroppedFile, setSelectedDroppedFile] =
    useState<DroppedFile | null>(null);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [isCitationSheetOpen, setIsCitationSheetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const richTextAreaRef = useRef<RichTextAreaHandle | null>(null);
  const dragCounterRef = useRef(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const selectedDroppedFileRef = useRef<DroppedFile | null>(null);
  selectedDroppedFileRef.current = selectedDroppedFile;

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

  const handleSend = useCallback(() => {
    onSend?.(text);
    richTextAreaRef.current?.clear();
    setText("");
  }, [onSend, text]);

  // Enter sends, Shift+Enter inserts a newline. The capture-phase handler runs
  // before ProseMirror's own listener on the contenteditable, so the keystroke
  // never reaches the editor. Skipped while a suggestion popup (mentions, the
  // "/" menu) is open, since Enter picks an item there.
  const handleKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onSend || event.key !== "Enter" || event.shiftKey) {
        return;
      }
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest(".tiptap")
      ) {
        return;
      }
      if (document.querySelector(".tippy-box")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleSend();
    },
    [handleSend, onSend]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setIsFocused(true);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const newItems: DroppedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) {
        const isImage = file.type.startsWith("image/");
        const objectUrl = isImage ? URL.createObjectURL(file) : undefined;
        if (objectUrl) objectUrlsRef.current.add(objectUrl);
        newItems.push({
          id: `${file.name}-${i}-${Date.now()}`,
          file,
          objectUrl,
        });
      }
    }
    setDroppedFiles((prev) => [...prev, ...newItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setDroppedFiles((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
        objectUrlsRef.current.delete(item.objectUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
    if (selectedDroppedFileRef.current?.id === id) {
      setSelectedDroppedFile(null);
      setIsImageZoomOpen(false);
      setIsCitationSheetOpen(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

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

  useEffect(() => {
    if (!taskCommand) {
      return;
    }

    setDismissedContextAttachmentIds(new Set());
    richTextAreaRef.current?.setContent("Let's start working on this task.");
  }, [taskCommand?.id, taskCommand]);

  const showFocusStyle = variant === "default" && (isFocused || isDragOver);
  const visibleContextAttachments =
    taskCommand?.contextAttachments?.filter(
      (attachment) => !dismissedContextAttachmentIds.has(attachment.id)
    ) ?? [];

  const isProductionToolbar = toolbarStyle === "production";

  // front `InputBar.tsx`: the composer box itself.
  const boxClassName = isProductionToolbar
    ? cn(
        "w-full rounded-2xl",
        "bg-muted-background",
        "border",
        "border-border-dark",
        "md:border-border-dark/50 md:has-[.tiptap:focus]:border-border-dark",
        "has-[.tiptap:focus]:border-highlight-300"
      )
    : cn(
        variant === "default" && "bg-primary-50/70 backdrop-blur-md",
        variant === "embedded" && "bg-primary-50",
        variant === "default" && (showFocusStyle ? "" : "border-border")
      );

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDownCapture={handleKeyDownCapture}
      className="flex w-full flex-col"
    >
      {onClose && (
        <Button
          icon={XClose}
          size="sm"
          variant="ghost"
          aria-label="Close"
          className="absolute right-3 top-3 z-20"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
      )}
      {aboveComposer}
      <div className={cn("flex w-full flex-col", boxClassName, className)}>
        {(visibleContextAttachments.length > 0 || droppedFiles.length > 0) && (
          <NewCitationGrid className="pt-2 px-2 pb-0 w-full" justify="start">
            {visibleContextAttachments.map((attachment) => (
              <NewCitation
                key={attachment.id}
                label={attachment.label}
                size="lg"
                visual={attachment.visual ?? File02}
                variant="secondary"
                tooltip={attachment.tooltip}
                onClose={() => {
                  setDismissedContextAttachmentIds(
                    (previousDismissedAttachmentIds) =>
                      new Set([
                        ...previousDismissedAttachmentIds,
                        attachment.id,
                      ])
                  );
                }}
              />
            ))}
            {droppedFiles.map(({ id, file, objectUrl }) => (
              <NewCitation
                key={id}
                label={file.name}
                size="lg"
                visual={file.type.startsWith("image/") ? Image01 : File02}
                variant="secondary"
                imgSrc={objectUrl}
                onClick={() => {
                  const item = { id, file, objectUrl };
                  setSelectedDroppedFile(item);
                  if (objectUrl) {
                    setIsImageZoomOpen(true);
                  } else {
                    setIsCitationSheetOpen(true);
                  }
                }}
                onClose={() => removeFile(id)}
              />
            ))}
          </NewCitationGrid>
        )}
        <RichTextArea
          ref={richTextAreaRef}
          placeholder={placeholder}
          onFocus={handleFocus}
          onTextChange={setText}
          defaultValue={taskCommand ? "Let's start working on this task." : ""}
          variant="compact"
          topBar={
            taskCommand ? (
              <div className="w-full p-2">
                <div className="rounded-xl bg-highlight-50 border border-highlight-100/70 px-2 pt-1 pb-0">
                  <TaskItem
                    id={taskCommand.id}
                    text={taskCommand.label}
                    isEditable={false}
                  />
                </div>
              </div>
            ) : undefined
          }
          topBarClassName={
            taskCommand
              ? "static items-stretch rounded-t-xl border-b-0 bg-transparent"
              : undefined
          }
          containerClassName={
            variant === "embedded"
              ? "min-h-0 rounded-none border-0 bg-transparent focus-within:ring-0 focus-within:border-0"
              : undefined
          }
          showFormattingMenu
          showAskSidekickMenu={false}
          className="placeholder:text-muted-foreground"
        />
        {isProductionToolbar ? (
          // front `InputBarContainer.tsx` + `InputBarButtons.tsx`.
          <div className="flex min-h-7 w-full items-center px-2 pb-2 pt-1.5">
            <div className="flex items-center gap-1">
              {agent ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Selected agent: ${agent.name}`}
                  className={cn(
                    "box-border inline-flex h-7 items-center gap-1.5 rounded-lg px-2",
                    "heading-xs bg-muted-background border-border text-primary-900",
                    "cursor-pointer transition-colors duration-200 hover:bg-hover"
                  )}
                >
                  <Avatar
                    size="xxs"
                    emoji={agent.emoji}
                    backgroundColor={agent.backgroundColor}
                    name={agent.name}
                  />
                  <span className="grow truncate">{agent.name}</span>
                </div>
              ) : (
                <Button
                  variant="ghost-secondary"
                  size="sm"
                  icon={Robot}
                  label="Agent"
                />
              )}
              <Button
                className="px-2"
                variant="ghost-secondary"
                size="sm"
                icon={BarHalf}
                tooltip="Standard"
              />
              <Button
                variant="ghost-secondary"
                size="sm"
                icon={ShapesPlus}
                tooltip="Capabilities"
              />
              <Button
                variant="ghost-secondary"
                size="sm"
                icon={Attachment01}
                tooltip="Attach a document"
              />
            </div>
            <div className="grow" />
            <div className="flex items-center gap-1">
              {contextUsagePercentage !== undefined && (
                <ContextUsageIndicator
                  buttonSize="sm"
                  percentage={contextUsagePercentage}
                />
              )}
              <VoicePicker
                status="idle"
                level={0}
                elapsedSeconds={0}
                onRecordStart={() => {}}
                onRecordStop={() => {}}
                size="sm"
                showStopLabel
              />
              <Button
                size="sm"
                icon={ArrowUp}
                variant="highlight"
                className="rounded-full"
                onClick={handleSend}
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full gap-2 p-2 pl-4">
            <Button
              variant="outline"
              icon={Plus}
              size="sm"
              tooltip="Attach a document"
              className="md:hidden"
            />
            <div className="hidden gap-0 md:flex">
              <Button
                variant="ghost-secondary"
                icon={Robot}
                size="xs"
                label="Dust"
                tooltip="Mention an Agent"
              />
              <Button
                variant="ghost-secondary"
                icon={Attachment01}
                size="xs"
                tooltip="Attach a document"
              />
              <Button
                variant="ghost-secondary"
                icon={Tool02}
                size="xs"
                tooltip="Add functionality"
              />
            </div>
            <div className="grow" />
            <div className="flex items-center gap-2 md:gap-1">
              <Button
                variant="ghost-secondary"
                icon={Microphone01}
                size="xs"
                isRounded
              />
              <Button
                variant="highlight"
                icon={ArrowUp}
                size="xs"
                tooltip="Send message"
                isRounded
                onClick={handleSend}
              />
            </div>
          </div>
        )}
      </div>

      {/* Image preview dialog */}
      {selectedDroppedFile?.objectUrl && (
        <ImageZoomDialog
          open={isImageZoomOpen}
          onOpenChange={(open) => {
            setIsImageZoomOpen(open);
            if (!open) setSelectedDroppedFile(null);
          }}
          image={{
            src: selectedDroppedFile.objectUrl,
            title: selectedDroppedFile.file.name,
          }}
        />
      )}

      {/* Document preview sheet */}
      <Sheet
        open={isCitationSheetOpen}
        onOpenChange={(open) => {
          setIsCitationSheetOpen(open);
          if (!open) setSelectedDroppedFile(null);
        }}
      >
        <SheetContent size="3xl" side="right">
          <SheetHeader>
            <SheetTitle>
              <div className="flex flex-1 flex-col w-full items-start gap-4">
                <div className="flex items-center gap-2">
                  {selectedDroppedFile && <Icon visual={File02} size="md" />}
                  <span>
                    {selectedDroppedFile?.file.name || "Document preview"}
                  </span>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-foreground">
                Document preview — {selectedDroppedFile?.file.type || "file"}
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
