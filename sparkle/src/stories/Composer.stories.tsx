import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "@sparkle/components/Composer";
import type { ComposerSuggestionItem } from "@sparkle/components/ComposerInput";
import { ComposerInput } from "@sparkle/components/ComposerInput";
import {
  ArrowUp,
  Attachment01,
  Command,
  File01,
  Folder,
  Globe01,
  Image01,
  Robot,
  SearchMd,
  ShapesPlus,
  Table,
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
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Tooltip,
  VoicePicker,
  type VoicePickerStatus,
} from "../index_with_tw_base";

const meta: Meta<typeof Composer> = {
  title: "Composer/Composer",
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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

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
  /** Object URL for image files — rendered as a preview card like in the product. */
  previewUrl?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const MOCK_KNOWLEDGE_NODES = [
  { id: "notion-roadmap", title: "Product Roadmap", source: "Notion" },
  { id: "drive-metrics", title: "Q3 Metrics", source: "Google Drive" },
  { id: "slack-design", title: "#design", source: "Slack" },
];

// ---------------------------------------------------------------------------
// Mock voice service (mirrors useVoiceTranscriberService statuses)
// ---------------------------------------------------------------------------

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
        window.setInterval(() => setLevel(Math.random()), 120),
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

  // Clear pending timers if the story unmounts mid-recording.
  useEffect(() => clearTimers, [clearTimers]);

  return { status, level, elapsedSeconds, startRecording, stopRecording };
}

function revokeAttachmentPreview(attachment: MockAttachment) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

// ---------------------------------------------------------------------------
// Interactive demo — reproduces the production input bar behaviors
// ---------------------------------------------------------------------------

function ComposerDemo({
  variant = "floating",
}: {
  variant?: "floating" | "flat";
}) {
  const [text, setText] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MockAgent | null>(null);
  const [selectedTools, setSelectedTools] = useState<MockTool[]>([]);
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        icon: File01,
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
      // Mock upload completion.
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
    setIsSubmitting(true);
    // Mock network submit.
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        text.trim() || `(empty message to @${selectedAgent?.name})`,
      ]);
      setText("");
      setAttachments((prev) => {
        prev.forEach(revokeAttachmentPreview);
        return [];
      });
      setIsSubmitting(false);
      inputRef.current?.focus();
    }, 900);
  }, [text, canSubmitEmpty, isSubmitting, selectedAgent]);

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
              "box-border inline-flex h-7 items-center gap-1.5 rounded-lg px-2",
              "heading-xs bg-muted-background text-primary-900",
              "cursor-pointer transition-colors duration-200 hover:bg-hover"
            )}
          >
            <Avatar
              size="xxs"
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
    <DropdownMenu onOpenChange={(open) => open && setToolSearch("")}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size="xs"
          icon={ShapesPlus}
          tooltip="Capabilities"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const filteredKnowledgeNodes = MOCK_KNOWLEDGE_NODES.filter((n) =>
    n.title.toLowerCase().includes(knowledgeSearch.toLowerCase())
  );
  const attachedIds = new Set(attachments.map((a) => a.id));

  // Mirrors InputBarAttachmentsPicker: searchbar + "Upload File" button in the
  // header, knowledge search results as checkbox items, empty state otherwise.
  const attachmentsPicker = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <DropdownMenu
        open={isAttachmentsOpen}
        onOpenChange={(open) => {
          setIsAttachmentsOpen(open);
          if (open) {
            setKnowledgeSearch("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={Attachment01}
            tooltip="Attach knowledge"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="flex w-full max-w-[680px] flex-col gap-4">
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted-background p-3">
          {messages.map((message, i) => (
            <div key={i} className="flex items-start gap-2">
              <Avatar
                size="xs"
                name={selectedAgent?.name ?? "You"}
                visual={selectedAgent?.pictureUrl}
              />
              <p className="text-sm text-foreground">{message}</p>
            </div>
          ))}
        </div>
      )}

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
                // Same rendering as the product's AttachmentCitation: image
                // files get a preview card, other attachments a citation card.
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
                          action={<CitationClose onClick={removeAttachment} />}
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
          selectedTools.length > 0
            ? selectedTools.map((tool) => (
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
              ))
            : undefined
        }
        leftActions={
          voice.status !== "recording" && (
            <>
              {agentPicker}
              {capabilitiesPicker}
              {attachmentsPicker}
            </>
          )
        }
        rightActions={
          <>
            <VoicePicker
              status={voice.status}
              level={voice.level}
              elapsedSeconds={voice.elapsedSeconds}
              onRecordStart={voice.startRecording}
              onRecordStop={voice.stopRecording}
              size="xs"
              showStopLabel
            />
            <Button
              variant="highlight"
              size="xs"
              icon={ArrowUp}
              className="rounded-full"
              isLoading={isSubmitting}
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
            />
          </>
        }
      >
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

      <p className="text-xs text-muted-foreground">
        <kbd>/</kbd> commands · <kbd>@</kbd> agents · <kbd>↵</kbd> send ·{" "}
        <kbd>Shift ↵</kbd> newline · hold or click the mic to record
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Floating: Story = {
  name: "Floating (default)",
  render: () => (
    <div className="flex min-h-[480px] items-center justify-center bg-structure-50 p-10 dark:bg-stone-900">
      <ComposerDemo variant="floating" />
    </div>
  ),
};

export const Flat: Story = {
  name: "Flat (embedded)",
  render: () => (
    <div className="flex min-h-[480px] items-center justify-center p-10">
      <ComposerDemo variant="flat" />
    </div>
  ),
};
