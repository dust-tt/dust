import {
  ArrowUpIcon,
  AttachmentIcon,
  BoltIcon,
  Button,
  cn,
  DocumentIcon,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  MicIcon,
  NewCitation,
  NewCitationGrid,
  PlusIcon,
  RobotIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";

type DroppedFile = { id: string; file: File; objectUrl?: string };

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
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

  const showFocusStyle = isFocused || isDragOver;

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "s-relative s-w-full s-max-w-4xl s-z-10",
        "s-rounded-3xl s-border s-bg-primary-50/70 s-backdrop-blur-md s-transition-all",
        showFocusStyle
          ? "s-border-highlight-300 s-ring-2 s-ring-highlight-300/50"
          : "s-border-border",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        {droppedFiles.length > 0 && (
          <NewCitationGrid
            className="s-pt-2 s-px-2 s-pb-0 s-w-full"
            justify="start"
          >
            {droppedFiles.map(({ id, file, objectUrl }) => (
              <NewCitation
                key={id}
                label={file.name}
                size="lg"
                visual={
                  file.type.startsWith("image/") ? ImageIcon : DocumentIcon
                }
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
                  {selectedDroppedFile && (
                    <Icon visual={DocumentIcon} size="md" />
                  )}
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
