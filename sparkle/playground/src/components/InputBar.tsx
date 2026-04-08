import {
  ArrowUpIcon,
  AttachmentIcon,
  BoltIcon,
  Button,
  cn,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  MicIcon,
  PlusIcon,
  RobotIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SpaceOpenIcon,
  StopIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

import { NewCitation, NewCitationGrid } from "./NewCitation";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";

type DroppedFile = { id: string; file: File; objectUrl?: string };

export type PillAgent = {
  id: string;
  name: string;
  emoji: string;
  backgroundColor: string;
};

const PILL_AGENTS: PillAgent[] = [
  {
    id: "gpt4",
    name: "@gpt4",
    emoji: "🤖",
    backgroundColor: "s-bg-indigo-100",
  },
  {
    id: "claude",
    name: "@claude",
    emoji: "🧠",
    backgroundColor: "s-bg-amber-100",
  },
  {
    id: "helper",
    name: "@helper",
    emoji: "💡",
    backgroundColor: "s-bg-green-100",
  },
  { id: "dust", name: "@dust", emoji: "✨", backgroundColor: "s-bg-rose-100" },
  {
    id: "translator",
    name: "@translator",
    emoji: "💬",
    backgroundColor: "s-bg-green-200",
  },
  {
    id: "codereviewer",
    name: "@codereviewer",
    emoji: "🔍",
    backgroundColor: "s-bg-sky-100",
  },
  {
    id: "writer",
    name: "@writer",
    emoji: "✍️",
    backgroundColor: "s-bg-violet-100",
  },
  {
    id: "analyst",
    name: "@analyst",
    emoji: "📊",
    backgroundColor: "s-bg-orange-100",
  },
  {
    id: "researcher",
    name: "@researcher",
    emoji: "🔬",
    backgroundColor: "s-bg-teal-100",
  },
  {
    id: "designer",
    name: "@designer",
    emoji: "🎨",
    backgroundColor: "s-bg-pink-100",
  },
];

interface InputBarProps {
  placeholder?: string;
  className?: string;
  instructionReference?: { start: number; end: number } | null;
  onInstructionInserted?: () => void;
  onSend?: (message: string, agent: PillAgent | null) => void;
  isThinking?: boolean;
  thinkingAgent?: PillAgent | null;
  selectedAgent?: PillAgent | null;
  onAgentChange?: (agent: PillAgent | null) => void;
}

export function InputBar({
  placeholder = "Ask a question",
  className,
  instructionReference,
  onInstructionInserted,
  onSend,
  isThinking = false,
  thinkingAgent = null,
  selectedAgent: controlledAgent,
  onAgentChange,
}: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
  const [internalAgent, setInternalAgent] = useState<PillAgent | null>(null);

  // Use controlled agent if provided, otherwise internal state
  const selectedAgent =
    controlledAgent !== undefined ? controlledAgent : internalAgent;
  const setSelectedAgent = useCallback(
    (agent: PillAgent | null) => {
      if (onAgentChange) {
        onAgentChange(agent);
      } else {
        setInternalAgent(agent);
      }
    },
    [onAgentChange]
  );
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

  // Whether the user switched agent while another is thinking
  const agentSwitchedDuringThinking =
    isThinking &&
    thinkingAgent &&
    selectedAgent &&
    selectedAgent.id !== thinkingAgent.id;
  const isSendDisabled = !!agentSwitchedDuringThinking;

  const handleSend = useCallback(() => {
    if (isSendDisabled) return;
    const content = richTextAreaRef.current?.getContent() ?? "";
    if (!content.trim()) return;
    onSend?.(content, selectedAgent);
    richTextAreaRef.current?.clearContent();
  }, [onSend, selectedAgent, isSendDisabled]);

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
        "s-rounded-3xl s-border s-bg-primary-50/70 dark:s-bg-primary-900/70 s-backdrop-blur-md",
        "s-transition-all s-duration-100 s-ease-in",
        showFocusStyle
          ? "s-border-highlight-300 dark:s-border-highlight-300-night s-ring-2 s-ring-highlight-300/50 dark:s-ring-highlight-700/60 s-scale-[1.02] s-shadow-[0_16px_50px_rgba(59,130,246,0.12),0_8px_25px_rgba(0,0,0,0.08)]"
          : "s-border-border dark:s-border-border-night s-scale-100 s-shadow-none",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col s-gap-4 s-p-4">
        {droppedFiles.length > 0 && (
          <NewCitationGrid className="s-pb-0 s-w-full" justify="start">
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
          onAgentMentioned={(agent) => {
            setSelectedAgent({
              id: agent.id,
              name: `@${agent.label}`,
              emoji: agent.emoji ?? "🤖",
              backgroundColor: agent.backgroundColor ?? "s-bg-muted-background",
            });
            // Remove the @mention from the editor content after a tick
            // (let the mention extension finish inserting first)
            setTimeout(() => {
              richTextAreaRef.current?.removeMentions();
            }, 0);
          }}
          variant="compact"
          showFormattingMenu
          showAskSidekickMenu={false}
          className="placeholder:s-text-muted-foreground/30 dark:placeholder:s-text-muted-foreground-night/30 s-pl-1 s-font-medium [&_.is-editor-empty:first-child::before]:!s-not-italic [&_.is-editor-empty:first-child::before]:!s-opacity-30 [&_.is-editor-empty:first-child::before]:!s-font-medium"
        />
        <div className="s-flex s-w-full s-gap-2">
          <Button
            variant="outline"
            icon={PlusIcon}
            size="sm"
            tooltip="Attach a document"
            className="md:s-hidden"
          />
          <div className="s-hidden s-gap-2 md:s-flex">
            {/* Agent pill */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="s-flex s-items-center s-gap-1.5 s-rounded-full s-border s-border-border/60 s-bg-white s-px-3 s-py-1 s-text-sm s-font-medium s-text-muted-foreground s-transition-colors hover:s-bg-muted-background hover:s-text-foreground dark:s-border-border-night/60 dark:s-bg-background-night dark:s-text-muted-foreground-night dark:hover:s-bg-muted-background-night dark:hover:s-text-foreground-night">
                  {selectedAgent ? (
                    <span
                      className={cn(
                        "s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-text-[10px]",
                        selectedAgent.backgroundColor
                      )}
                    >
                      {selectedAgent.emoji}
                    </span>
                  ) : (
                    <Icon visual={RobotIcon} size="xs" />
                  )}
                  {selectedAgent ? selectedAgent.name : "Agent"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel label="Mention an agent" />
                {PILL_AGENTS.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    label={agent.name}
                    icon={RobotIcon}
                    onClick={() => setSelectedAgent(agent)}
                  />
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem label="Search agents..." icon={PlusIcon} />
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Capabilities pill */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="s-flex s-items-center s-gap-1.5 s-rounded-full s-border s-border-border/60 s-bg-white s-px-3 s-py-1 s-text-sm s-font-medium s-text-muted-foreground s-transition-colors hover:s-bg-muted-background hover:s-text-foreground dark:s-border-border-night/60 dark:s-bg-background-night dark:s-text-muted-foreground-night dark:hover:s-bg-muted-background-night dark:hover:s-text-foreground-night">
                  <Icon visual={BoltIcon} size="xs" />
                  Capabilities
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel label="Capabilities" />
                <DropdownMenuItem label="Web search" icon={BoltIcon} />
                <DropdownMenuItem label="Browse URLs" icon={BoltIcon} />
                <DropdownMenuItem label="Generate images" icon={ImageIcon} />
                <DropdownMenuSeparator />
                <DropdownMenuItem label="Tables & queries" icon={TableIcon} />
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Attach pill */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="s-flex s-items-center s-gap-1.5 s-rounded-full s-border s-border-border/60 s-bg-white s-px-3 s-py-1 s-text-sm s-font-medium s-text-muted-foreground s-transition-colors hover:s-bg-muted-background hover:s-text-foreground dark:s-border-border-night/60 dark:s-bg-background-night dark:s-text-muted-foreground-night dark:hover:s-bg-muted-background-night dark:hover:s-text-foreground-night">
                  <Icon visual={AttachmentIcon} size="xs" />
                  Attach
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel label="Attach from" />
                <DropdownMenuItem label="Upload file" icon={PlusIcon} />
                <DropdownMenuSeparator />
                <DropdownMenuItem label="Company Data" icon={SpaceOpenIcon} />
                <DropdownMenuItem label="Engineering" icon={SpaceOpenIcon} />
                <DropdownMenuItem
                  label="Sales & Support"
                  icon={SpaceOpenIcon}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="s-grow" />
          <div className="s-flex s-items-center s-gap-2 md:s-gap-1">
            <Button
              variant="ghost-secondary"
              icon={MicIcon}
              size="xs"
              isRounded
            />
            {isThinking && !isSendDisabled ? (
              <Button
                variant="outline"
                icon={StopIcon}
                size="xs"
                tooltip="Stop generating"
                isRounded
              />
            ) : isSendDisabled ? (
              <span title="Wait for the first agent to finish before changing">
                <Button
                  variant="highlight"
                  icon={ArrowUpIcon}
                  size="xs"
                  isRounded
                  disabled
                  tooltip="Wait for the first agent to finish before changing"
                />
              </span>
            ) : (
              <Button
                variant="highlight"
                icon={ArrowUpIcon}
                size="xs"
                tooltip="Send message"
                isRounded
                onClick={handleSend}
              />
            )}
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
