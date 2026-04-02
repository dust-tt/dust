import {
  ArrowUpIcon,
  AttachmentIcon,
  Avatar,
  BoltIcon,
  Button,
  cn,
  DocumentIcon,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  MicIcon,
  PlusIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  RobotIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

import { mockAgents } from "../data";
import { NewCitation, NewCitationGrid } from "./NewCitation";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";

// Set to "2000ms" to debug animations, "300ms" for production.
const TRANSITION_DURATION = "200ms";
const TRANSITION_EASING = "cubic-bezier(0.34, 1.15, 0.64, 1)";

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
  const [hasMention, setHasMention] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<
    (typeof mockAgents)[number] | null
  >(null);
  const [isAgentPopoverOpen, setIsAgentPopoverOpen] = useState(false);
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
        "s-rounded-3xl s-border s-bg-primary-50/70 dark:s-bg-primary-900/70 s-backdrop-blur-md s-transition-all",
        showFocusStyle
          ? "s-border-highlight-300 dark:s-border-highlight-300-night s-ring-2 s-ring-highlight-300/50 dark:s-ring-highlight-700/60"
          : "s-border-border dark:s-border-border-night",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        {droppedFiles.length > 0 && (
          <NewCitationGrid
            className={cn(
              "s-pt-2 s-px-2 s-pb-0 s-w-full s-transition-all",
              hasMention &&
                "s-max-h-0 s-overflow-hidden s-opacity-0 s-pt-0 s-pb-0"
            )}
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
        {/* Text area */}
        <RichTextArea
          ref={richTextAreaRef}
          placeholder={placeholder}
          onFocus={handleFocus}
          onMentionsChange={setHasMention}
          variant="compact"
          showFormattingMenu={!hasMention}
          showAskSidekickMenu={false}
          className={cn(
            "placeholder:s-text-muted-foreground dark:placeholder:s-text-muted-foreground-night",
            "s-overflow-y-auto s-max-h-[40vh]",
            hasMention && "!s-pt-3 !s-pb-3 !s-pl-4 !s-pr-20"
          )}
        />
        {/* Toolbar row – collapses to 0 height when mention is active */}
        <div
          style={{
            transitionDuration: TRANSITION_DURATION,
            transitionTimingFunction: TRANSITION_EASING,
          }}
          className={cn(
            "s-flex s-w-full s-items-center s-gap-2 s-pl-4 s-pr-4 s-overflow-hidden",
            "s-transition-all",
            hasMention ? "s-max-h-0 s-py-0" : "s-max-h-16 s-py-2"
          )}
        >
          <div
            style={{
              transitionDuration: hasMention ? "50ms" : "150ms",
              transitionTimingFunction: TRANSITION_EASING,
            }}
            className={cn(
              "s-flex s-items-center s-gap-0 s-transition-opacity",
              hasMention ? "s-opacity-0" : "s-opacity-100"
            )}
          >
            <Button
              variant="outline"
              icon={PlusIcon}
              size="sm"
              tooltip="Attach a document"
              className="md:s-hidden"
            />
            <div className="s-hidden s-gap-0 s-items-center md:s-flex">
              <PopoverRoot
                open={isAgentPopoverOpen}
                onOpenChange={setIsAgentPopoverOpen}
              >
                <PopoverTrigger asChild>
                  {selectedAgent ? (
                    <button
                      type="button"
                      className={cn(
                        "s-flex s-items-center s-gap-1.5 s-rounded-xl s-px-2 s-py-1",
                        "s-text-xs s-font-medium s-text-foreground dark:s-text-foreground-night",
                        "s-border s-border-border dark:s-border-border-night",
                        "hover:s-bg-muted-background dark:hover:s-bg-muted-background-night",
                        "s-transition-colors s-cursor-pointer"
                      )}
                    >
                      <Avatar
                        size="xs"
                        emoji={selectedAgent.emoji}
                        name={selectedAgent.name}
                      />
                      <span>{selectedAgent.name}</span>
                    </button>
                  ) : (
                    <Button
                      variant="ghost-secondary"
                      icon={RobotIcon}
                      size="xs"
                      label="Agent"
                      tooltip="Select an Agent"
                    />
                  )}
                </PopoverTrigger>
                <PopoverContent className="s-w-64 s-p-1">
                  <div className="s-flex s-flex-col s-max-h-80 s-overflow-y-auto">
                    {mockAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        className={cn(
                          "s-flex s-items-center s-gap-2 s-rounded-lg s-px-3 s-py-2 s-w-full s-text-left",
                          "hover:s-bg-muted-background dark:hover:s-bg-muted-background-night",
                          "s-transition-colors s-cursor-pointer",
                          selectedAgent?.id === agent.id &&
                            "s-bg-muted-background dark:s-bg-muted-background-night"
                        )}
                        onClick={() => {
                          setSelectedAgent(agent);
                          setIsAgentPopoverOpen(false);
                        }}
                      >
                        <Avatar
                          size="xs"
                          emoji={agent.emoji}
                          name={agent.name}
                        />
                        <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night s-truncate">
                          {agent.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </PopoverRoot>
              <Button
                variant="ghost-secondary"
                icon={BoltIcon}
                size="xs"
                tooltip="Add a skill"
              />
              <Button
                variant="ghost-secondary"
                icon={AttachmentIcon}
                size="xs"
                tooltip="Attach a document"
              />
            </div>
          </div>
          <div className="s-grow" />
          {/* Invisible spacer to reserve space for the absolutely-positioned send/mic */}
          <div className="s-flex s-items-center s-gap-2 md:s-gap-1 s-invisible">
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
              isRounded
            />
          </div>
        </div>
      </div>

      {/* Single send/mic – absolutely positioned; moves vertically as container height changes */}
      <div
        className="s-absolute s-right-4 s-flex s-items-center s-gap-2 md:s-gap-1"
        style={{ bottom: "10px" }}
      >
        <Button variant="ghost-secondary" icon={MicIcon} size="xs" isRounded />
        <Button
          variant="highlight"
          icon={ArrowUpIcon}
          size="xs"
          tooltip="Send message"
          isRounded
        />
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
