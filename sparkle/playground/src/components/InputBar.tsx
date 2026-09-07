import {
  ArrowUp,
  Attachment01,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  File02,
  Icon,
  Image01,
  ImageZoomDialog,
  Microphone01,
  Planet,
  Plus,
  Robot,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  ShapesPlus,
  XClose,
} from "@dust-tt/sparkle";
import { OpenaiLogo } from "@dust-tt/sparkle/logo/platforms";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  NewCitation,
  NewCitationGrid,
  type NewCitationProps,
} from "./NewCitation";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";
import { TaskItem } from "./TaskItem";

const INPUT_BAR_PILL_SURFACE_CLASSNAME =
  "border-[0.5px] border-border-dark bg-background dark:bg-stone-725 " +
  "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]";

const INPUT_BAR_PILL_HOVER_CLASSNAME =
  "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]";

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
  isFloating?: boolean;
  autoFocus?: boolean;
  beforeSendButton?: React.ReactNode;
  onInstructionInserted?: () => void;
  onClose?: () => void;
  onSend?: () => void;
}

export function InputBar({
  placeholder = "What are we working on?",
  className,
  instructionReference,
  taskCommand,
  variant = "default",
  isFloating = true,
  autoFocus = false,
  beforeSendButton,
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

  // Clear the focus ring only when focus leaves the whole input (keyboard
  // Tab-out, Escape blur, click outside). Keeps it set when moving focus to an
  // inner control (e.g. the toolbar buttons).
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
      setIsFocused(false);
    }
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
      onBlur={handleBlur}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative overflow-hidden",
        variant === "embedded" && "rounded-2xl bg-primary-50",
        variant === "default" &&
          cn(
            "rounded-squircle-40 w-full",
            "border",
            showFocusStyle
              ? "border-border-dark bg-stone-25 dark:border-stone-750 dark:bg-[oklch(0.310_0.007_75)]"
              : "border-border bg-[oklch(0.988_0_89.876)] dark:bg-[oklch(0.294_0.008_84.593)]",
            "transition-colors duration-100 ease-emphasized motion-reduce:transition-none",
            isFloating &&
              cn(
                "md:border-white/90",
                "md:shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.04),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
                "md:dark:border-transparent",
                "md:dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]"
              )
          ),
        className
      )}
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
      <div className="flex w-full flex-col">
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
          autoFocus={autoFocus}
          onFocus={handleFocus}
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
        <div className="flex min-h-7 w-full items-center px-3 pt-2 pb-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost-secondary"
              icon={Robot}
              size="xs"
              label="Agent"
              tooltip="Mention an Agent"
              isRounded
              className={cn(
                INPUT_BAR_PILL_SURFACE_CLASSNAME,
                INPUT_BAR_PILL_HOVER_CLASSNAME
              )}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost-secondary"
                  icon={Plus}
                  size="xs"
                  isRounded
                  tooltip="More"
                  className={cn(
                    INPUT_BAR_PILL_SURFACE_CLASSNAME,
                    INPUT_BAR_PILL_HOVER_CLASSNAME
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  icon={Attachment01}
                  label="Attach a document"
                />
                <DropdownMenuItem icon={ShapesPlus} label="Add tools" />
                <DropdownMenuItem icon={Planet} label="Spaces" />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grow" />
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost-secondary"
              icon={OpenaiLogo}
              size="xs"
              tooltip="Model picker"
              className="px-2"
            />
            <Button
              variant="ghost-secondary"
              icon={Microphone01}
              size="xs"
              isRounded
            />
            {beforeSendButton}
            <Button
              variant="highlight"
              icon={ArrowUp}
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
