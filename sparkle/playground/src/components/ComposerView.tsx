import {
  ArrowUp,
  Attachment01,
  Avatar,
  BarFull,
  BarHalf,
  BarLow,
  Bold01,
  Button,
  Check,
  CheckDone01,
  ChevronDown,
  ChevronRight,
  Chip,
  Citation,
  CitationClose,
  CitationIcons,
  CitationImage,
  CitationTitle,
  cn,
  Code01,
  Composer,
  ComposerInput,
  type ComposerSuggestionItem,
  DiscoveryGlint,
  DoubleQuotes,
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
  File01,
  Folder,
  Globe01,
  Heading01,
  Icon,
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
  Toolbar,
  ToolbarContent,
  ToolbarIcon,
  Tooltip,
  UploadCloud02,
  VoicePicker,
  type VoicePickerStatus,
} from "@dust-tt/sparkle";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Playground replica of the production conversation input bar
 * (`front/components/assistant/conversation/input_bar`). Built entirely from
 * Sparkle primitives with mocked data so the layout, breakpoints and dropdown
 * behaviour can be iterated on — in particular on mobile, where the real app
 * needs a device to reproduce. Resize the browser (or use the width presets
 * below) to switch between the desktop and mobile layouts: the composer reads
 * the real viewport through `md:` variants, exactly like production.
 */

// Mirrors front/components/assistant/conversation/input_bar/inputBarPillStyles.ts
const PILL_SURFACE_CLASSNAME = cn(
  "border-[0.5px] border-border-dark bg-background dark:bg-stone-725",
  "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]"
);
const PILL_HOVER_CLASSNAME =
  "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]";
const PILL_CLASSNAME = cn(PILL_SURFACE_CLASSNAME, PILL_HOVER_CLASSNAME);

interface MockAgent {
  id: string;
  name: string;
  description: string;
  pictureUrl?: string;
}

const MOCK_AGENTS: MockAgent[] = [
  {
    id: "dust",
    name: "dust",
    description: "Your general purpose agent. It has access to all of your...",
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
    description: "Generate images from a prompt",
    icon: Image01,
  },
  {
    id: "data-analysis",
    label: "Data Analysis",
    description: "Run queries over your tables",
    icon: Table,
  },
  {
    id: "extract-data",
    label: "Extract Data",
    description: "Pull structured data out of documents",
    icon: File01,
  },
];

const MOCK_KNOWLEDGE_NODES = [
  { id: "kn-1", title: "Q3 Board Deck", source: "Google Drive" },
  { id: "kn-2", title: "Engineering Handbook", source: "Notion" },
  { id: "kn-3", title: "Customer Feedback 2026", source: "Google Drive" },
  { id: "kn-4", title: "Pricing Experiments", source: "Notion" },
];

const MOCK_SPACES = [
  { id: "space-company", name: "Company Data" },
  { id: "space-eng", name: "Engineering" },
  { id: "space-sales", name: "Sales" },
];

// Mirrors MODEL_TIERS in front/components/model_picker/modelPickerUtils.ts.
const MODEL_TIERS = [
  { id: "fast", name: "Fast", description: "Quick, low cost" },
  { id: "standard", name: "Standard", description: "Best for most" },
  { id: "complex", name: "Complex", description: "Slower, most capable" },
] as const;
type ModelTierId = (typeof MODEL_TIERS)[number]["id"];

const TIER_ICON: Record<
  ModelTierId,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

const DEFAULT_TIER_ID: ModelTierId = "standard";

const MOCK_MODELS = ["Claude 5 Opus", "Claude 5 Sonnet", "GPT-5"];

interface MockAttachment {
  id: string;
  title: string;
  isUploading: boolean;
  previewUrl?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

function revokeAttachmentPreview(attachment: MockAttachment) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

/**
 * Stand-in for `useVoiceTranscriberService`: walks through the same status
 * machine (authorizing → recording → transcribing → idle) so the mic button
 * renders every state the production one does.
 */
function useMockVoiceService(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<VoicePickerStatus>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearInterval(timer));
    timersRef.current = [];
  }, []);

  const startRecording = useCallback(() => {
    setStatus("authorizing_microphone");
    const authorizeTimer = window.setTimeout(() => {
      setStatus("recording");
      setElapsedSeconds(0);
      timersRef.current.push(
        window.setInterval(() => setLevel(Math.random()), 120),
        window.setInterval(
          () => setElapsedSeconds((seconds) => seconds + 1),
          1000
        )
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

/** Tracks the viewport width so the story can report which layout is live. */
function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

// Which picker the mobile layout has drilled into. Sub-menus are positioned
// beside their parent menu, and `parent width + sub-menu width` exceeds a phone
// viewport, so Radix flips them to the other side where they do not fit either
// — leaving them mostly off-screen. On mobile the "+" menu therefore closes and
// the picker reopens as a top-level dropdown anchored to the "+" button, which
// Radix keeps inside the viewport. Mirrors InputBarPlusMenu in `front`.
const MOBILE_PICKERS = ["capabilities", "attachments", "spaces"] as const;
type MobilePicker = (typeof MOBILE_PICKERS)[number];

interface AnchorTriggerProps {
  anchorRef: React.RefObject<HTMLElement | null>;
}

function AnchorTrigger({ anchorRef }: AnchorTriggerProps) {
  return (
    <DropdownMenuTrigger asChild>
      <div
        ref={(el) => {
          if (el && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            el.style.position = "fixed";
            el.style.top = `${rect.top}px`;
            el.style.left = `${rect.left}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
            el.style.pointerEvents = "none";
            el.style.opacity = "0";
          }
        }}
      />
    </DropdownMenuTrigger>
  );
}

const HIGHLIGHT_STORAGE_KEY = "dust:model-picker-highlight-dismissals";
const REPLAY_PARAM = "replayHighlight";

function isReplayRequested(): boolean {
  return new URLSearchParams(window.location.search).has(REPLAY_PARAM);
}
const MAX_HIGHLIGHT_DISMISSALS = 2;

function readHighlightDismissals(): number {
  try {
    const parsed = Number.parseInt(
      window.localStorage.getItem(HIGHLIGHT_STORAGE_KEY) ?? "",
      10
    );
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    // Storage blocked (Safari private browsing): with no way to remember the
    // count, staying quiet beats highlighting forever.
    return MAX_HIGHLIGHT_DISMISSALS;
  }
}

function writeHighlightDismissals(dismissals: number): void {
  try {
    window.localStorage.setItem(HIGHLIGHT_STORAGE_KEY, String(dismissals));
  } catch {
    // Same as above: nothing to do if the write is refused.
  }
}

interface ModelPickerHighlightProps {
  children: React.ReactNode;
}

function ModelPickerHighlight({ children }: ModelPickerHighlightProps) {
  const [isActive, setIsActive] = useState(
    () =>
      isReplayRequested() ||
      readHighlightDismissals() < MAX_HIGHLIGHT_DISMISSALS
  );
  const hostRef = useRef<HTMLSpanElement>(null);
  const hasCountedDismissalRef = useRef(false);

  const dismiss = useCallback(() => {
    if (!hasCountedDismissalRef.current && !isReplayRequested()) {
      hasCountedDismissalRef.current = true;
      writeHighlightDismissals(readHighlightDismissals() + 1);
    }
    setIsActive(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isActive) {
      return;
    }
    const dismissOnPrimaryButton = (event: PointerEvent) => {
      if (event.button === 0) {
        dismiss();
      }
    };
    host.addEventListener("pointerdown", dismissOnPrimaryButton);
    return () =>
      host.removeEventListener("pointerdown", dismissOnPrimaryButton);
  }, [isActive, dismiss]);

  return (
    <span ref={hostRef} className="inline-flex">
      <DiscoveryGlint isActive={isActive}>{children}</DiscoveryGlint>
    </span>
  );
}

export function ComposerView() {
  const [text, setText] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MockAgent | null>(
    MOCK_AGENTS[0]
  );
  const [selectedTools, setSelectedTools] = useState<MockTool[]>([]);
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [agentSearch, setAgentSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [isCapabilitiesSubOpen, setIsCapabilitiesSubOpen] = useState(false);
  const [isSpacesSubOpen, setIsSpacesSubOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [hasOpenedPlusMenu, setHasOpenedPlusMenu] = useState(false);
  const [openMobilePicker, setOpenMobilePicker] = useState<MobilePicker | null>(
    null
  );
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [selectedTierId, setSelectedTierId] =
    useState<ModelTierId>(DEFAULT_TIER_ID);
  const [isMoreModelsExpanded, setIsMoreModelsExpanded] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextMessageId = useRef(0);
  const composerWrapperRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLDivElement>(null);
  const [toolbarAnchor, setToolbarAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth < 768;

  const openPicker = (picker: MobilePicker) => {
    setIsPlusMenuOpen(false);
    setOpenMobilePicker(picker);
  };

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

  // Visual-only: the playground input is a plain textarea (no TipTap), so the
  // toolbar buttons toggle their own active state instead of marking up text.
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

  // Keep the send button (and its spinner) while a submit is in flight, but let
  // the mic own the row while recording or transcribing.
  const showSendButton = voice.status === "idle" || isSubmitting;

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
        icon: File01,
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
  const filteredKnowledgeNodes = MOCK_KNOWLEDGE_NODES.filter((n) =>
    n.title.toLowerCase().includes(knowledgeSearch.toLowerCase())
  );
  const attachedIds = new Set(attachments.map((a) => a.id));

  const agentPicker = (
    <DropdownMenu onOpenChange={(open) => open && setAgentSearch("")}>
      <DropdownMenuTrigger asChild>
        {selectedAgent ? (
          <button
            type="button"
            aria-label={`Selected agent: ${selectedAgent.name}`}
            className={cn(
              "box-border inline-flex h-8 items-center gap-1.5 rounded-full px-2 md:h-6",
              "heading-xs text-primary-900",
              PILL_CLASSNAME,
              "cursor-pointer transition-colors duration-200"
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
            className={PILL_CLASSNAME}
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

  const capabilitiesItems = (
    <>
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
    </>
  );

  const capabilitiesPicker = isMobile ? (
    <DropdownMenu
      open={openMobilePicker === "capabilities"}
      onOpenChange={(open) => {
        setOpenMobilePicker(open ? "capabilities" : null);
        if (open) {
          setToolSearch("");
        }
      }}
    >
      <AnchorTrigger anchorRef={plusButtonRef} />
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-80 max-w-[calc(100vw-1rem)]"
      >
        {capabilitiesItems}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
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
      <DropdownMenuSubContent className="w-80 max-w-[calc(100vw-1rem)]">
        {capabilitiesItems}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const knowledgeHeaders = (
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
  );

  const knowledgeItems = knowledgeSearch ? (
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
  );

  const attachmentsPicker = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {isMobile ? (
        <DropdownMenu
          open={openMobilePicker === "attachments"}
          onOpenChange={(open) => {
            setOpenMobilePicker(open ? "attachments" : null);
            if (open) {
              setKnowledgeSearch("");
            }
          }}
        >
          <AnchorTrigger anchorRef={plusButtonRef} />
          <DropdownMenuContent
            align="end"
            collisionPadding={8}
            className="h-80 w-80 max-w-[calc(100vw-1rem)] [&_[data-radix-scroll-area-viewport]>div]:h-full"
            dropdownHeaders={knowledgeHeaders}
          >
            {knowledgeItems}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
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
            dropdownHeaders={knowledgeHeaders}
          >
            {knowledgeItems}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );

  const spacesItems = (
    <>
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
    </>
  );

  const spacesPicker = isMobile ? (
    <DropdownMenu
      open={openMobilePicker === "spaces"}
      onOpenChange={(open) => setOpenMobilePicker(open ? "spaces" : null)}
    >
      <AnchorTrigger anchorRef={plusButtonRef} />
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-64 max-w-[calc(100vw-1rem)]"
      >
        {spacesItems}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
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
      <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-1rem)]">
        {spacesItems}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const plusMenu = (
    <>
      <div ref={plusButtonRef} className="flex items-center">
        <DropdownMenu
          open={isPlusMenuOpen}
          onOpenChange={(open) => {
            setIsPlusMenuOpen(open);
            if (open) {
              setHasOpenedPlusMenu(true);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost-secondary"
              icon={Plus}
              size="xs"
              isRounded
              tooltip="More"
              className={PILL_CLASSNAME}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            collisionPadding={8}
            className="w-64 max-w-[calc(100vw-1rem)]"
          >
            {isMobile ? (
              <>
                <DropdownMenuItem
                  label="Capabilities"
                  icon={ShapesPlus}
                  onClick={() => openPicker("capabilities")}
                />
                <DropdownMenuItem
                  label="Attach knowledge"
                  icon={Attachment01}
                  onClick={() => openPicker("attachments")}
                />
                <DropdownMenuItem
                  label="Spaces"
                  icon={Planet}
                  onClick={() => openPicker("spaces")}
                />
              </>
            ) : (
              <>
                {capabilitiesPicker}
                {attachmentsPicker}
                {spacesPicker}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isMobile && hasOpenedPlusMenu && (
        <>
          {capabilitiesPicker}
          {attachmentsPicker}
          {spacesPicker}
        </>
      )}
    </>
  );

  // Mirrors front/components/model_picker/ModelPicker.tsx as the input bar
  // renders it: `showLabel={false}`, so the trigger is an icon-only
  // ghost-secondary button carrying the tier bars, with the tier name in a
  // tooltip. The menu lists the three tiers with their descriptions, then a
  // collapsed "More models" row.
  const shownTier = MODEL_TIERS.find((tier) => tier.id === selectedTierId);
  const modelPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="px-2"
          variant="ghost-secondary"
          size="xs"
          icon={TIER_ICON[selectedTierId]}
          tooltip={`Model picker: ${shownTier?.name}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start" side="bottom">
        {MODEL_TIERS.map((tier) => {
          const isSelected = tier.id === selectedTierId;
          const isDefault = tier.id === DEFAULT_TIER_ID;
          return (
            <DropdownMenuItem
              key={tier.id}
              icon={TIER_ICON[tier.id]}
              label={`${tier.name}${isDefault ? " (Default)" : ""}`}
              endComponent={
                isSelected ? (
                  <Icon
                    visual={Check}
                    size="sm"
                    className="text-muted-foreground"
                  />
                ) : (
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {tier.description}
                  </span>
                )
              }
              onClick={() => setSelectedTierId(tier.id)}
              onSelect={(e) => e.preventDefault()}
            />
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          label="More models"
          endComponent={
            <Icon
              visual={isMoreModelsExpanded ? ChevronDown : ChevronRight}
              size="xs"
            />
          }
          onClick={() => setIsMoreModelsExpanded((expanded) => !expanded)}
          onSelect={(e) => e.preventDefault()}
        />
        {isMoreModelsExpanded &&
          MOCK_MODELS.map((model) => (
            <DropdownMenuItem
              key={model}
              label={model}
              onSelect={(e) => e.preventDefault()}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background px-4 py-6">
      <div className="mb-4 flex w-full max-w-[680px] flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted-background px-2 py-1 font-mono">
          {viewportWidth}px · {viewportWidth < 768 ? "mobile" : "desktop"}
        </span>
        <span>
          Resize the window to cross the <code>md</code> breakpoint (768px).
        </span>
      </div>

      <h1 className="heading-3xl mb-6 text-center text-foreground">
        What's the plan, Alexandre?
      </h1>

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
                <ModelPickerHighlight>{modelPicker}</ModelPickerHighlight>
                {/* Mic and send coexist; the mic stays a grey icon button so
                    send remains the only highlighted action. */}
                <VoicePicker
                  status={voice.status}
                  level={voice.level}
                  elapsedSeconds={voice.elapsedSeconds}
                  onRecordStart={voice.startRecording}
                  onRecordStop={voice.stopRecording}
                  size="xs"
                  showStopLabel
                  buttonProps={{ className: "rounded-full" }}
                />
                {showSendButton && (
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
            {/* No formatting affordance on mobile: the "T" toggle used to sit
                here, but it crowded the first row and pushed the input down.
                Formatting stays desktop-only, via the selection toolbar below. */}
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

          {/* Desktop: selecting text reveals the toolbar, mirroring the real
              editor's BubbleMenu. Portaled to the body so it isn't clipped by
              the composer's overflow-hidden card. */}
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
    </div>
  );
}
