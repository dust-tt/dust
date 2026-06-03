import {
  ArrowUpV2,
  Attachment01V2,
  Button,
  cn,
  File02V2,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  Microphone01V2,
  PlusV2,
  RobotV2,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tool02V2,
  XCloseV2,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

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
  onSend?: () => void;
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
}: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
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

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "s-relative s-w-full s-z-10 s-transition-all s-rounded-3xl s-max-w-4xl s-border s-border-highlight-300 dark:s-border-highlight-300-night s-ring-2 s-ring-highlight-300/50 dark:s-ring-highlight-700/60",
        variant === "default" &&
          "s-bg-primary-50/70 dark:s-bg-primary-900/70 s-backdrop-blur-md",
        variant === "embedded" && "s-bg-primary-50 dark:s-bg-primary-900",
        variant === "default" &&
          (showFocusStyle ? "" : "s-border-border dark:s-border-border-night"),
        className
      )}
    >
      {onClose && (
        <Button
          icon={XCloseV2}
          size="sm"
          variant="ghost"
          aria-label="Close"
          className="s-absolute s-right-3 s-top-3 s-z-20"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
      )}
      <div className="s-flex s-w-full s-flex-col">
        {(visibleContextAttachments.length > 0 || droppedFiles.length > 0) && (
          <NewCitationGrid
            className="s-pt-2 s-px-2 s-pb-0 s-w-full"
            justify="start"
          >
            {visibleContextAttachments.map((attachment) => (
              <NewCitation
                key={attachment.id}
                label={attachment.label}
                size="lg"
                visual={attachment.visual ?? File02V2}
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
                visual={file.type.startsWith("image/") ? ImageIcon : File02V2}
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
          defaultValue={taskCommand ? "Let's start working on this task." : ""}
          variant="compact"
          topBar={
            taskCommand ? (
              <div className="s-w-full s-p-2">
                <div className="s-rounded-xl s-bg-highlight-50 s-border s-border-highlight-100/70 s-px-2 s-pt-1 s-pb-0 dark:s-bg-muted-background-night">
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
              ? "s-static s-items-stretch s-rounded-t-xl s-border-b-0 s-bg-transparent dark:s-bg-transparent"
              : undefined
          }
          containerClassName={
            variant === "embedded"
              ? "s-min-h-0 s-rounded-none s-border-0 s-bg-transparent focus-within:s-ring-0 focus-within:s-border-0 dark:s-bg-transparent"
              : undefined
          }
          showFormattingMenu
          showAskSidekickMenu={false}
          className="placeholder:s-text-muted-foreground dark:placeholder:s-text-muted-foreground-night"
        />
        <div className="s-flex s-w-full s-gap-2 s-p-2 s-pl-4">
          <Button
            variant="outline"
            icon={PlusV2}
            size="sm"
            tooltip="Attach a document"
            className="md:s-hidden"
          />
          <div className="s-hidden s-gap-0 md:s-flex">
            <Button
              variant="ghost-secondary"
              icon={RobotV2}
              size="xs"
              label="Dust"
              tooltip="Mention an Agent"
            />
            <Button
              variant="ghost-secondary"
              icon={Attachment01V2}
              size="xs"
              tooltip="Attach a document"
            />
            <Button
              variant="ghost-secondary"
              icon={Tool02V2}
              size="xs"
              tooltip="Add functionality"
            />
          </div>
          <div className="s-grow" />
          <div className="s-flex s-items-center s-gap-2 md:s-gap-1">
            <Button
              variant="ghost-secondary"
              icon={Microphone01V2}
              size="xs"
              isRounded
            />
            <Button
              variant="highlight"
              icon={ArrowUpV2}
              size="xs"
              tooltip="Send message"
              isRounded
              onClick={onSend}
            />
          </div>
        </div>
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
              <div className="s-flex s-flex-1 s-flex-col s-w-full s-items-start s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  {selectedDroppedFile && <Icon visual={File02V2} size="md" />}
                  <span>
                    {selectedDroppedFile?.file.name || "Document preview"}
                  </span>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                Document preview — {selectedDroppedFile?.file.type || "file"}
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
