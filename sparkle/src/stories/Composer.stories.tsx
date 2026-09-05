import type { Meta, StoryObj } from "@storybook/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Composer } from "@sparkle/components/Composer";
import type { ComposerSuggestionItem } from "@sparkle/components/ComposerInput";
import { ComposerInput } from "@sparkle/components/ComposerInput";
import {
  ArrowUp,
  Attachment01,
  Bold01,
  CheckDone01,
  ChevronDown,
  Code01,
  Command,
  DoubleQuotes,
  File02,
  Folder,
  Globe01,
  Heading01,
  Image01,
  Italic01,
  Link01,
  List,
  Planet,
  Plus,
  Robot,
  SearchMd,
  ShapesPlus,
  Table,
  Type01,
  UploadCloud02,
} from "@sparkle/icons/v2-stroke";

import {
  Avatar,
  Button,
  Chip,
  Citation,
  CitationClose,
  CitationIcons,
  CitationImage,
  CitationTitle,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  Toolbar,
  ToolbarContent,
  ToolbarIcon,
  Tooltip,
  VoicePicker,
  type VoicePickerStatus,
} from "../index_with_tw_base";

const meta: Meta<typeof Composer> = {
  title: "Product/Conversation/Composer",
  component: Composer,
  parameters: {
    docs: {
      description: {
        component: `The message composer shell. Mirrors the product input bar: agent picker, capabilities picker, attachments, voice recording and send — all built from Sparkle primitives (\`Button\`, \`VoicePicker\`, \`DropdownMenu\`, \`Chip\`, \`Citation\`). The text input supports \`/\` (commands) and \`@\` (agents) suggestions.`,
      },
    },
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof Composer>;

interface MockAgent {
  id: string;
  name: string;
  description: string;
  pictureUrl?: string;
}

const MOCK_AGENTS: MockAgent[] = [
  {
    id: "dust",
    name: "Dust",
    description: "The general-purpose assistant",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
  },
  { id: "research", name: "Research", description: "Deep web research" },
  { id: "code", name: "Code", description: "Write and review code" },
  { id: "data", name: "Data", description: "Analyse spreadsheets and charts" },
];

interface MockTool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const MOCK_TOOLS: MockTool[] = [
  {
    id: "web-search",
    label: "Web Search",
    description: "Search and browse the web",
    icon: Globe01,
  },
  {
    id: "image-generation",
    label: "Image Generation",
    description: "Generate images",
    icon: Image01,
  },
  {
    id: "table-query",
    label: "Table Query",
    description: "Query structured data",
    icon: Table,
  },
  {
    id: "code-interpreter",
    label: "Code Interpreter",
    description: "Run code on your data",
    icon: Command,
  },
];

interface MockAttachment {
  id: string;
  title: string;
  isUploading: boolean;
  previewUrl?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const MOCK_KNOWLEDGE_NODES = [
  { id: "notion-roadmap", title: "Product Roadmap", source: "Notion" },
  { id: "drive-metrics", title: "Q3 Metrics", source: "Google Drive" },
  { id: "slack-design", title: "#design", source: "Slack" },
];

const MOCK_SPACES = [
  { id: "space-general", name: "General" },
  { id: "space-engineering", name: "Engineering" },
  { id: "space-marketing", name: "Marketing" },
];

const MOCK_MODELS = ["Auto", "Fast", "Reasoning"];

function useMockVoiceService(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<VoicePickerStatus>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
  }, []);

  const startRecording = useCallback(() => {
    setStatus("authorizing_microphone");
    const authorizeTimer = window.setTimeout(() => {
      setStatus("recording");
      setElapsedSeconds(0);
      timersRef.current.push(
        // Deterministic sawtooth stand-in for real microphone levels.
        window.setInterval(() => setLevel((prev) => (prev + 0.17) % 1), 120),
        window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
      );
    }, 400);
    timersRef.current.push(authorizeTimer);
  }, []);

  const stopRecording = useCallback(() => {
    clearTimers();
    setLevel(0);
    setStatus("transcribing");
    const transcribeTimer = window.setTimeout(() => {
      setStatus("idle");
      setElapsedSeconds(0);
      onTranscript("This is a mock voice transcription. ");
    }, 1400);
    timersRef.current.push(transcribeTimer);
  }, [clearTimers, onTranscript]);

  useEffect(() => clearTimers, [clearTimers]);

  return { status, level, elapsedSeconds, startRecording, stopRecording };
}

function revokeAttachmentPreview(attachment: MockAttachment) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function ComposerDemo({
  variant = "floating",
}: {
  variant?: "floating" | "flat";
}) {
  const [text, setText] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MockAgent | null>(null);
  const [selectedTools, setSelectedTools] = useState<MockTool[]>([]);
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Mobile: tapping the "T" button toggles the formatting toolbar (below).
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  // Desktop: selecting text in the textarea shows it instead, mirroring the
  // real editor's BubbleMenu.
  const [hasSelection, setHasSelection] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  // Visual-only demo: the story's ComposerInput is a plain textarea (no
  // TipTap editor), so these buttons toggle their own active state instead
  // of applying real formatting to the text.
  const toggleFormat = useCallback((format: string) => {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(format)) {
        next.delete(format);
      } else {
        next.add(format);
      }
      return next;
    });
  }, []);
  const formatGroups = useMemo(
    () => [
      {
        id: "block",
        items: [
          <ToolbarIcon
            key="heading"
            icon={Heading01}
            size="xs"
            active={activeFormats.has("heading")}
            tooltip="Heading"
            onClick={() => toggleFormat("heading")}
          />,
        ],
      },
      {
        id: "marks",
        items: [
          <ToolbarIcon
            key="bold"
            icon={Bold01}
            size="xs"
            active={activeFormats.has("bold")}
            tooltip="Bold"
            onClick={() => toggleFormat("bold")}
          />,
          <ToolbarIcon
            key="italic"
            icon={Italic01}
            size="xs"
            active={activeFormats.has("italic")}
            tooltip="Italic"
            onClick={() => toggleFormat("italic")}
          />,
          <ToolbarIcon
            key="link"
            icon={Link01}
            size="xs"
            active={activeFormats.has("link")}
            tooltip="Link"
            onClick={() => toggleFormat("link")}
          />,
        ],
      },
      {
        id: "lists",
        items: [
          <ToolbarIcon
            key="checklist"
            icon={CheckDone01}
            size="xs"
            active={activeFormats.has("checklist")}
            tooltip="Checklist"
            onClick={() => toggleFormat("checklist")}
          />,
          <ToolbarIcon
            key="list"
            icon={List}
            size="xs"
            active={activeFormats.has("list")}
            tooltip="Bulleted list"
            onClick={() => toggleFormat("list")}
          />,
        ],
      },
      {
        id: "code",
        items: [
          <ToolbarIcon
            key="quote"
            icon={DoubleQuotes}
            size="xs"
            active={activeFormats.has("quote")}
            tooltip="Quote"
            onClick={() => toggleFormat("quote")}
          />,
          <ToolbarIcon
            key="code"
            icon={Code01}
            size="xs"
            active={activeFormats.has("code")}
            tooltip="Code"
            onClick={() => toggleFormat("code")}
          />,
        ],
      },
    ],
    [activeFormats, toggleFormat]
  );
  const [agentSearch, setAgentSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [isCapabilitiesSubOpen, setIsCapabilitiesSubOpen] = useState(false);
  const [isSpacesSubOpen, setIsSpacesSubOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("Auto");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextMessageId = useRef(0);
  // Anchors the floating desktop toolbar: it's portaled to document.body (like
  // the real BubbleMenu) so it isn't clipped by the composer's overflow-hidden
  // card, then positioned centered above this element's top edge.
  const composerWrapperRef = useRef<HTMLDivElement>(null);
  const [toolbarAnchor, setToolbarAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    const updateSelection = () => {
      const selected = el.selectionStart !== el.selectionEnd;
      setHasSelection(selected);
      const wrapper = composerWrapperRef.current;
      if (selected && wrapper) {
        const rect = wrapper.getBoundingClientRect();
        setToolbarAnchor({ top: rect.top, left: rect.left + rect.width / 2 });
      }
    };
    el.addEventListener("select", updateSelection);
    el.addEventListener("mouseup", updateSelection);
    el.addEventListener("keyup", updateSelection);
    return () => {
      el.removeEventListener("select", updateSelection);
      el.removeEventListener("mouseup", updateSelection);
      el.removeEventListener("keyup", updateSelection);
    };
  }, []);

  const voice = useMockVoiceService(
    useCallback((transcript: string) => {
      setText((prev) => prev + transcript);
    }, [])
  );

  const addTool = useCallback((tool: MockTool) => {
    setSelectedTools((prev) =>
      prev.some((t) => t.id === tool.id) ? prev : [...prev, tool]
    );
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const newAttachments = files.map<MockAttachment>((f, i) => ({
        id: `${f.name}-${i}-${f.lastModified}`,
        title: f.name,
        isUploading: true,
        previewUrl: f.type.startsWith("image/")
          ? URL.createObjectURL(f)
          : undefined,
        icon: File02,
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
      newAttachments.forEach((attachment) => {
        window.setTimeout(() => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === attachment.id ? { ...a, isUploading: false } : a
            )
          );
        }, 1200);
      });
      e.target.value = "";
      setIsAttachmentsOpen(false);
      inputRef.current?.focus();
    },
    []
  );

  const addKnowledgeNode = useCallback(
    (node: (typeof MOCK_KNOWLEDGE_NODES)[number]) => {
      setAttachments((prev) =>
        prev.some((a) => a.id === node.id)
          ? prev.filter((a) => a.id !== node.id)
          : [
              ...prev,
              {
                id: node.id,
                title: node.title,
                isUploading: false,
                icon: Folder,
              },
            ]
      );
    },
    []
  );

  const canSubmitEmpty = selectedAgent != null;
  const isSubmitDisabled =
    (!text.trim() && !canSubmitEmpty) ||
    isSubmitting ||
    voice.status !== "idle";

  const handleSubmit = useCallback(() => {
    if ((!text.trim() && !canSubmitEmpty) || isSubmitting) {
      return;
    }
    // Mirror production: the draft is consumed optimistically at submit time,
    // so text typed while the request is in flight is not clobbered. Ref
    // mutation and URL revocation stay outside the state updaters, which
    // React may run more than once.
    const submittedText =
      text.trim() || `(empty message to @${selectedAgent?.name})`;
    const messageId = `msg-${nextMessageId.current}`;
    nextMessageId.current += 1;
    setIsSubmitting(true);
    setText("");
    attachments.forEach(revokeAttachmentPreview);
    setAttachments([]);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: messageId, text: submittedText }]);
      setIsSubmitting(false);
      inputRef.current?.focus();
    }, 900);
  }, [text, canSubmitEmpty, isSubmitting, selectedAgent, attachments]);

  const slashItems: ComposerSuggestionItem[] = [
    {
      id: "upload-file",
      label: "upload-file",
      description: "Attach a file from your computer",
      icon: Attachment01,
    },
    ...MOCK_TOOLS.map((tool) => ({
      id: tool.id,
      label: tool.label.toLowerCase().replace(/\s/g, "-"),
      description: tool.description,
      icon: tool.icon,
    })),
  ];

  const mentionItems: ComposerSuggestionItem[] = MOCK_AGENTS.map((agent) => ({
    id: agent.id,
    label: agent.name,
    description: agent.description,
    icon: Robot,
    visual: agent.pictureUrl,
  }));

  const filteredAgents = MOCK_AGENTS.filter((a) =>
    a.name.toLowerCase().includes(agentSearch.toLowerCase())
  );
  const filteredTools = MOCK_TOOLS.filter(
    (t) =>
      !selectedTools.some((s) => s.id === t.id) &&
      t.label.toLowerCase().includes(toolSearch.toLowerCase())
  );

  const agentPicker = (
    <DropdownMenu onOpenChange={(open) => open && setAgentSearch("")}>
      <DropdownMenuTrigger asChild>
        {selectedAgent ? (
          <button
            type="button"
            aria-label={`Selected agent: ${selectedAgent.name}`}
            className={cn(
              "box-border inline-flex h-7 items-center gap-1.5 rounded-full px-2",
              "heading-xs text-primary-900",
              "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)]",
              "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]",
              "cursor-pointer transition-colors duration-200 hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]"
            )}
          >
            <Avatar
              size="3xs"
              name={selectedAgent.name}
              visual={selectedAgent.pictureUrl}
            />
            <span className="grow truncate">{selectedAgent.name}</span>
          </button>
        ) : (
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={Robot}
            label="Agent"
            isRounded
            className={cn(
              "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)]",
              "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]",
              "hover:bg-primary-100"
            )}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuSearchbar
          name="search-agents"
          placeholder="Search agents"
          value={agentSearch}
          onChange={setAgentSearch}
        />
        <DropdownMenuSeparator />
        {selectedAgent && (
          <>
            <DropdownMenuItem
              label={`Remove @${selectedAgent.name}`}
              onClick={() => setSelectedAgent(null)}
            />
            <DropdownMenuSeparator />
          </>
        )}
        {filteredAgents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            label={agent.name}
            description={agent.description}
            onClick={() => setSelectedAgent(agent)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const capabilitiesPicker = (
    <DropdownMenuSub
      open={isCapabilitiesSubOpen}
      onOpenChange={(open) => {
        setIsCapabilitiesSubOpen(open);
        if (open) {
          setToolSearch("");
        }
      }}
    >
      <DropdownMenuSubTrigger
        label="Capabilities"
        icon={
          <Icon
            size="xs"
            visual={ShapesPlus}
            className="text-muted-foreground"
          />
        }
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsCapabilitiesSubOpen(true);
        }}
      />
      <DropdownMenuSubContent className="w-80">
        <DropdownMenuSearchbar
          name="search-capabilities"
          placeholder="Search capabilities"
          value={toolSearch}
          onChange={setToolSearch}
        />
        <DropdownMenuSeparator />
        {filteredTools.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            {toolSearch
              ? "No capabilities found"
              : "No more capabilities to select"}
          </div>
        )}
        {filteredTools.map((tool) => (
          <DropdownMenuItem
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            description={tool.description}
            onClick={() => addTool(tool)}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const filteredKnowledgeNodes = MOCK_KNOWLEDGE_NODES.filter((n) =>
    n.title.toLowerCase().includes(knowledgeSearch.toLowerCase())
  );
  const attachedIds = new Set(attachments.map((a) => a.id));

  const attachmentsPicker = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <DropdownMenuSub
        open={isAttachmentsOpen}
        onOpenChange={(open) => {
          setIsAttachmentsOpen(open);
          if (open) {
            setKnowledgeSearch("");
          }
        }}
      >
        <DropdownMenuSubTrigger
          label="Attach knowledge"
          icon={
            <Icon
              size="xs"
              visual={Attachment01}
              className="text-muted-foreground"
            />
          }
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsAttachmentsOpen(true);
          }}
        />
        <DropdownMenuSubContent
          collisionPadding={15}
          className="h-80 w-80 xs:h-96 xs:w-96 [&_[data-radix-scroll-area-viewport]>div]:h-full"
          dropdownHeaders={
            <>
              <DropdownMenuSearchbar
                autoFocus
                name="search-files"
                placeholder="Search"
                value={knowledgeSearch}
                onChange={setKnowledgeSearch}
                button={
                  <Button
                    icon={UploadCloud02}
                    label="Upload File"
                    className="ml-4"
                    onClick={() => fileInputRef.current?.click()}
                  />
                }
              />
              <DropdownMenuSeparator />
            </>
          }
        >
          {knowledgeSearch ? (
            filteredKnowledgeNodes.map((node) => (
              <DropdownMenuCheckboxItem
                key={node.id}
                checked={attachedIds.has(node.id)}
                icon={Folder}
                label={node.title}
                description={node.source}
                onCheckedChange={() => addKnowledgeNode(node)}
              />
            ))
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center justify-center gap-0 text-center text-base font-semibold text-primary-400">
                <Icon visual={SearchMd} size="sm" />
                Search knowledge
              </div>
            </div>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );

  const spacesPicker = (
    <DropdownMenuSub open={isSpacesSubOpen} onOpenChange={setIsSpacesSubOpen}>
      <DropdownMenuSubTrigger
        label={
          selectedSpaceIds.length > 0
            ? `${selectedSpaceIds.length} Space${selectedSpaceIds.length > 1 ? "s" : ""}`
            : "Spaces"
        }
        icon={
          <Icon size="xs" visual={Planet} className="text-muted-foreground" />
        }
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsSpacesSubOpen(true);
        }}
      />
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel>Spaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MOCK_SPACES.map((space) => {
          const checked = selectedSpaceIds.includes(space.id);
          return (
            <DropdownMenuCheckboxItem
              key={space.id}
              label={space.name}
              checked={checked}
              onCheckedChange={(nextChecked) => {
                setSelectedSpaceIds((prev) =>
                  nextChecked
                    ? [...prev, space.id]
                    : prev.filter((id) => id !== space.id)
                );
              }}
              onSelect={(event) => event.preventDefault()}
            />
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const plusMenu = (
    <DropdownMenu open={isPlusMenuOpen} onOpenChange={setIsPlusMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={Plus}
          size="xs"
          isRounded
          tooltip="More"
          className={cn(
            "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)]",
            "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]",
            "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]"
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {capabilitiesPicker}
        {attachmentsPicker}
        {spacesPicker}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const modelPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size="xs"
          label={`Model: ${selectedModel}`}
          icon={ChevronDown}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MOCK_MODELS.map((model) => (
          <DropdownMenuItem
            key={model}
            label={model}
            onClick={() => setSelectedModel(model)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex w-full max-w-[680px] flex-col gap-4">
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted-background p-3">
          {messages.map((message) => (
            <div key={message.id} className="flex items-start gap-2">
              <Avatar
                size="xs"
                name={selectedAgent?.name ?? "You"}
                visual={selectedAgent?.pictureUrl}
              />
              <p className="text-sm text-foreground">{message.text}</p>
            </div>
          ))}
        </div>
      )}

      <div ref={composerWrapperRef} className="relative w-full">
        <Composer
          variant={variant}
          isFocused={isFocused}
          onContentClick={() => inputRef.current?.focus()}
          attachments={
            attachments.length > 0
              ? attachments.map((attachment) => {
                  const removeAttachment = () => {
                    revokeAttachmentPreview(attachment);
                    setAttachments((prev) =>
                      prev.filter((a) => a.id !== attachment.id)
                    );
                  };
                  return (
                    <Tooltip
                      key={attachment.id}
                      label={attachment.title}
                      tooltipTriggerAsChild
                      trigger={
                        attachment.previewUrl ? (
                          <Citation
                            compact
                            isLoading={attachment.isUploading}
                            containerClassName="h-full min-h-24"
                          >
                            <CitationImage
                              imgSrc={attachment.previewUrl}
                              title={attachment.title}
                              isLoading={attachment.isUploading}
                              onClose={removeAttachment}
                            />
                          </Citation>
                        ) : (
                          <Citation
                            compact
                            containerClassName="h-full min-h-24"
                            className="h-full"
                            isLoading={attachment.isUploading}
                            loadingLabel="Uploading"
                            action={
                              <CitationClose onClick={removeAttachment} />
                            }
                          >
                            <CitationIcons>
                              <Icon visual={attachment.icon} size="sm" />
                            </CitationIcons>
                            <CitationTitle className="truncate text-ellipsis">
                              {attachment.title}
                            </CitationTitle>
                          </Citation>
                        )
                      }
                    />
                  );
                })
              : undefined
          }
          chips={
            selectedTools.length > 0 || selectedSpaceIds.length > 0
              ? [
                  ...selectedTools.map((tool) => (
                    <Chip
                      key={tool.id}
                      size="xs"
                      label={tool.label}
                      icon={tool.icon}
                      className="bg-background text-foreground"
                      onRemove={() =>
                        setSelectedTools((prev) =>
                          prev.filter((t) => t.id !== tool.id)
                        )
                      }
                    />
                  )),
                  ...MOCK_SPACES.filter((space) =>
                    selectedSpaceIds.includes(space.id)
                  ).map((space) => (
                    <Chip
                      key={space.id}
                      size="xs"
                      label={space.name}
                      icon={Planet}
                      className="bg-background text-foreground"
                      onRemove={() =>
                        setSelectedSpaceIds((prev) =>
                          prev.filter((id) => id !== space.id)
                        )
                      }
                    />
                  )),
                ]
              : undefined
          }
          leftActions={
            voice.status !== "recording" && (
              <>
                {agentPicker}
                {plusMenu}
              </>
            )
          }
          rightActions={
            <>
              {modelPicker}
              {!text || voice.status !== "idle" ? (
                <VoicePicker
                  status={voice.status}
                  level={voice.level}
                  elapsedSeconds={voice.elapsedSeconds}
                  onRecordStart={voice.startRecording}
                  onRecordStop={voice.stopRecording}
                  size="xs"
                  showStopLabel
                  buttonProps={
                    voice.status === "idle"
                      ? {
                          className: cn(
                            "rounded-full",
                            "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors",
                            "bg-linear-to-b from-highlight-400 to-highlight-500 dark:from-blue-500 dark:to-blue-600 text-white",
                            "shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_color-mix(in_oklch,var(--color-foreground)_10%,transparent)]",
                            "dark:shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_rgba(0,0,0,0.1)]",
                            "hover:after:bg-white/10 active:after:bg-white/10"
                          ),
                        }
                      : undefined
                  }
                />
              ) : (
                <Button
                  variant="highlight"
                  size="xs"
                  aria-label="Send message"
                  icon={ArrowUp}
                  className="rounded-full"
                  isLoading={isSubmitting}
                  disabled={isSubmitDisabled}
                  onClick={handleSubmit}
                />
              )}
            </>
          }
        >
          {/* Mobile: manual "T" button toggles the overlay toolbar, as in prod. */}
          <div className="relative flex w-full md:hidden">
            <ToolbarIcon
              icon={Type01}
              size="xs"
              active={isToolbarOpen}
              tooltip="Formatting"
              onClick={() => setIsToolbarOpen((open) => !open)}
            />
            <Toolbar
              variant="overlay"
              className={cn(
                isToolbarOpen
                  ? "pointer-events-auto w-full"
                  : "pointer-events-none hidden"
              )}
              onClose={() => setIsToolbarOpen(false)}
            >
              <ToolbarContent groups={formatGroups} />
            </Toolbar>
          </div>
          <ComposerInput
            ref={inputRef}
            value={text}
            onChange={setText}
            onSubmit={handleSubmit}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Get work done"
            suggestions={[
              {
                trigger: "/",
                items: slashItems,
                onSelect: (item) => {
                  if (item.id === "upload-file") {
                    fileInputRef.current?.click();
                    return;
                  }
                  const tool = MOCK_TOOLS.find((t) => t.id === item.id);
                  if (tool) {
                    addTool(tool);
                  }
                },
              },
              {
                trigger: "@",
                items: mentionItems,
                onSelect: (item) => {
                  const agent = MOCK_AGENTS.find((a) => a.id === item.id);
                  if (agent) {
                    setSelectedAgent(agent);
                  }
                },
              },
            ]}
          />
        </Composer>
        {/* Desktop: selecting text reveals the toolbar automatically, mirroring
          the real editor's BubbleMenu. Portaled to the body (like the real
          BubbleMenu's appendTo) so it floats above the composer instead of
          being clipped by its overflow-hidden card, centered on top of its
          top edge. */}
        {hasSelection &&
          toolbarAnchor &&
          createPortal(
            <div
              className="fixed z-30 hidden -translate-x-1/2 -translate-y-1/2 md:block"
              style={{ top: toolbarAnchor.top, left: toolbarAnchor.left }}
            >
              <Toolbar variant="inline">
                <ToolbarContent groups={formatGroups} />
              </Toolbar>
            </div>,
            document.body
          )}
      </div>

      <p className="text-xs text-muted-foreground">
        <kbd>/</kbd> commands · <kbd>@</kbd> agents · <kbd>↵</kbd> send ·{" "}
        <kbd>Shift ↵</kbd> newline · hold or click the mic to record
      </p>
    </div>
  );
}

/**
 * The bare Composer shell without the interactive demo: attachments, chips,
 * children (input area), and left/right action slots are all plain ReactNode
 * props — here filled with static placeholders to show the anatomy.
 * @summary Minimal static composition of the Composer slots.
 */
export const StaticShell: Story = {
  args: {
    variant: "floating",
    isFocused: false,
  },
  render: (args) => (
    <div className="flex min-h-[240px] w-full max-w-[680px] items-center p-10">
      <Composer
        {...args}
        leftActions={
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={Robot}
            label="Agent"
            isRounded
          />
        }
        rightActions={
          <Button
            variant="highlight"
            size="xs"
            aria-label="Send message"
            icon={ArrowUp}
            className="rounded-full"
          />
        }
      >
        <p className="pb-2 text-sm text-muted-foreground">Get work done</p>
      </Composer>
    </div>
  ),
};

/**
 * The default `floating` variant — an elevated card with a squircle border and
 * layered shadows, for the composer hovering over the conversation. Fully
 * interactive demo simulating the product input bar: agent/capabilities/
 * attachment pickers, `/` and `@` suggestions, mock voice recording, a
 * formatting toolbar, and optimistic message submission.
 * @summary Interactive demo of the elevated floating variant.
 */
export const Floating: Story = {
  name: "Floating (default)",
  render: () => (
    <div className="flex min-h-[480px] items-center justify-center bg-structure-50 p-10 dark:bg-stone-900">
      <ComposerDemo variant="floating" />
    </div>
  ),
};

/**
 * The `flat` variant — a simple bordered card with no elevation, for embedding
 * the composer inside an existing surface (panels, drawers). Runs the same
 * interactive demo as Floating; only the shell treatment differs.
 * @summary Interactive demo of the embedded flat variant.
 */
export const Flat: Story = {
  name: "Flat (embedded)",
  render: () => (
    <div className="flex min-h-[480px] items-center justify-center p-10">
      <ComposerDemo variant="flat" />
    </div>
  ),
};
