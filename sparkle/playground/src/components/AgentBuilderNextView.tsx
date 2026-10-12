import {
  ActionCard,
  BarChart01,
  BarFooter,
  BarHeader,
  Beaker02,
  BookOpen01,
  Button,
  LayoutRight,
  Notification,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Sidekick,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  useSendNotification,
  XClose,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ManagedSkill, MockTool } from "../data/build";
import type { Agent } from "../data/types";
import { mockUsers } from "../data/users";
import {
  type AddedSkill,
  type AddedTool,
  CapabilitiesSection,
  type ToolConfiguration,
} from "./agent_builder_next/CapabilitiesSection";
import {
  type BuilderTrigger,
  getBuilderSpaceById,
  validateAgentName,
  getKnowledgeNodeById,
  mockBuilderSpaces,
} from "./agent_builder_next/data";
import { DataAccessSection } from "./agent_builder_next/DataAccessSection";
import {
  AgentCreatedDialog,
  DiscardChangesDialog,
  EditorGateMessage,
  PendingSuggestionsDialog,
  PersonalConnectionRequiredDialog,
} from "./agent_builder_next/dialogs";
import { IdentityHeader } from "./agent_builder_next/IdentityHeader";
import { InstructionsSection } from "./agent_builder_next/InstructionsSection";
import { ModelSection } from "./agent_builder_next/ModelSection";
import { AdvancedSection } from "./agent_builder_next/AdvancedSection";
import {
  emptyKnowledgeConfiguration,
  type KnowledgeConfiguration,
  KnowledgeSheet,
} from "./agent_builder_next/KnowledgeSheet";
import {
  DEFAULT_MODEL_SELECTION,
  type ModelSelection,
} from "./agent_builder_next/ModelPicker";
import {
  type AgentAvatar,
  type AgentScope,
} from "./agent_builder_next/AvatarPickerSheet";
import { SuggestedPromptsSection } from "./agent_builder_next/SuggestedPromptsSection";
import { TriggersSection } from "./agent_builder_next/TriggersSection";
import { InputBar } from "./InputBar";
import {
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
} from "./NewConversationMessages";
import type { RichTextAreaHandle } from "./RichTextArea";

// A fake, feature-complete copy of the production agent builder
// (`front/components/agent_builder`). Every control is wired to local state;
// nothing is persisted.

export type AgentBuilderNextViewTemplate = {
  handle: string;
  emoji: string;
  backgroundColor: string;
};

export type AgentBuilderMode = "create" | "edit" | "duplicate";

const CURRENT_USER = mockUsers[0];
const COLLAPSED_RIGHT_PANEL_SIZE = 3;
const MIN_EXPANDED_RIGHT_PANEL_SIZE = 20;
const SIDEKICK_PLACEHOLDERS = ["Get work done", "Ask anything"];
const PREVIEW_PLACEHOLDERS = [
  "Get work done",
  "Ask anything",
  "Type @ to call an agent",
  "Type @ to list your favorite agents",
];

function humanizeHandle(handle: string): string {
  const withSpaces = handle.replace(/([A-Z])/g, " $1").trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}

type RightTab = "sidekick" | "preview" | "insights";

export function AgentBuilderNextView({
  template,
  onClose,
  mode: modeProp,
  /** Pretend the viewer is a workspace admin who is not an editor (edit mode only). */
  simulateEditorGate = false,
}: {
  template?: AgentBuilderNextViewTemplate;
  onClose?: () => void;
  mode?: AgentBuilderMode;
  simulateEditorGate?: boolean;
}) {
  const sendNotification = useSendNotification();
  const mode: AgentBuilderMode = modeProp ?? (template ? "create" : "create");
  const isNewAgent = mode === "create";

  // ----- form state -------------------------------------------------------
  const [name, setName] = useState(
    template
      ? humanizeHandle(template.handle).replace(/\s+/g, "")
      : mode === "edit"
        ? "ReleaseScribe"
        : mode === "duplicate"
          ? "ReleaseScribe_Copy"
          : ""
  );
  const [description, setDescription] = useState(
    mode === "create" && !template
      ? ""
      : "Turns merged pull requests into customer-ready release notes."
  );
  const [avatar, setAvatar] = useState<AgentAvatar>({
    emoji: template?.emoji ?? "🤖",
    backgroundColor: template?.backgroundColor ?? "bg-gray-300",
  });
  const [instructionsLength, setInstructionsLength] = useState(0);
  const [hasSuggestions, setHasSuggestions] = useState(false);
  const [modelSelection, setModelSelection] = useState<ModelSelection>(
    DEFAULT_MODEL_SELECTION
  );
  const [responseFormat, setResponseFormat] = useState("");
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([
    "space-company",
  ]);
  const [addedSkills, setAddedSkills] = useState<AddedSkill[]>([]);
  const [addedTools, setAddedTools] = useState<AddedTool[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeConfiguration[]>([]);
  const [triggers, setTriggers] = useState<BuilderTrigger[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([""]);
  const [isTriggersLoading, setIsTriggersLoading] = useState(mode === "edit");
  const [scope, setScope] = useState<AgentScope>("hidden");
  const [editorIds, setEditorIds] = useState<string[]>([CURRENT_USER.id]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [ignoreCreditThreshold, setIgnoreCreditThreshold] = useState(false);
  const [isEditorGateVisible, setIsEditorGateVisible] = useState(
    mode === "edit" && simulateEditorGate
  );
  const [isBecomingEditor, setIsBecomingEditor] = useState(false);

  // ----- ui state ---------------------------------------------------------
  const [isDirty, setIsDirty] = useState(mode === "duplicate");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(mode !== "create");
  const [showCreatedDialog, setShowCreatedDialog] = useState(false);
  const [showPendingSuggestions, setShowPendingSuggestions] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showPersonalConnections, setShowPersonalConnections] = useState(false);
  const [knowledgeSheet, setKnowledgeSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    initial: KnowledgeConfiguration;
  }>({ open: false, mode: "create", initial: emptyKnowledgeConfiguration() });
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024
  );
  const [rightTab, setRightTab] = useState<RightTab>("sidekick");
  const [isSidekickStarting, setIsSidekickStarting] = useState(true);
  const [isPreviewPreparing, setIsPreviewPreparing] = useState(false);
  const [previewHasActivity, setPreviewHasActivity] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const editorRef = useRef<RichTextAreaHandle | null>(null);
  const previewPanelRef =
    useRef<React.ComponentRef<typeof ResizablePanel>>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );
  const sidekickPlaceholder = useMemo(
    () =>
      SIDEKICK_PLACEHOLDERS[
        Math.floor(Math.random() * SIDEKICK_PLACEHOLDERS.length)
      ],
    []
  );
  const previewPlaceholder = useMemo(
    () =>
      PREVIEW_PLACEHOLDERS[
        Math.floor(Math.random() * PREVIEW_PLACEHOLDERS.length)
      ],
    []
  );
  const sidekickTime = useMemo(
    () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  useEffect(() => {
    setLoaded(true);
    const sidekickTimer = window.setTimeout(
      () => setIsSidekickStarting(false),
      900
    );
    const triggersTimer = window.setTimeout(
      () => setIsTriggersLoading(false),
      700
    );
    return () => {
      window.clearTimeout(sidekickTimer);
      window.clearTimeout(triggersTimer);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) =>
      setIsPreviewPanelOpen(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!previewPanelRef.current) {
      return;
    }
    if (isPreviewPanelOpen) {
      previewPanelRef.current.expand();
    } else {
      previewPanelRef.current.collapse();
    }
  }, [isPreviewPanelOpen]);

  useEffect(() => {
    if (isEditorGateVisible && rightTab === "sidekick") {
      setRightTab("preview");
    }
  }, [isEditorGateVisible, rightTab]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  // ----- derived ----------------------------------------------------------
  const isSaveDisabled =
    (!isDirty && mode !== "duplicate") || isSubmitting || isEditorGateVisible;
  const personalTools = addedTools
    .filter(
      (entry) => entry.tool.account === "Personal" && !entry.tool.isConnected
    )
    .map((entry) => entry.tool);
  const headerTitle =
    mode === "edit"
      ? `Edit agent ${name || "Agent"}`
      : mode === "duplicate"
        ? `Duplicate ${name || "Agent"}`
        : "Create new agent";

  const spaceDependents = useCallback(
    (spaceId: string) => {
      const names: string[] = [];
      knowledge.forEach((entry) => {
        if (
          entry.nodeIds.some(
            (id) => getKnowledgeNodeById(id)?.spaceId === spaceId
          )
        ) {
          names.push(`Knowledge: ${entry.name || "Untitled"}`);
        }
      });
      addedTools.forEach((entry) => {
        if (
          !entry.tool.isWorkspaceWide &&
          entry.tool.spaceIds.includes(spaceId)
        ) {
          names.push(`Tool: ${entry.tool.name}`);
        }
      });
      return names;
    },
    [knowledge, addedTools]
  );

  // ----- handlers ---------------------------------------------------------
  // The editor reports its content on mount and on focus changes as well as
  // on edits; only an actual change of text counts as a user edit.
  const lastInstructionsRef = useRef<string | null>(null);
  const handleInstructionsChange = (value: string) => {
    setInstructionsLength(value.length);
    if (lastInstructionsRef.current === null) {
      lastInstructionsRef.current = value;
      return;
    }
    if (value !== lastInstructionsRef.current) {
      lastInstructionsRef.current = value;
      markDirty();
    }
  };

  const handleEditorBlur = () => {
    if (!isNewAgent || instructionsLength < 20) {
      return;
    }
    if (!name) {
      setName("ReleaseScribe");
    }
    if (!description) {
      setDescription(
        "Turns merged pull requests into customer-ready release notes."
      );
    }
    if (avatar.emoji === "🤖") {
      setAvatar({ emoji: "✍️", backgroundColor: "bg-sky-300" });
    }
  };

  const finishSave = () => {
    setIsSubmitting(true);
    window.setTimeout(() => {
      setIsSubmitting(false);
      setIsDirty(false);
      if (!isSaved) {
        setIsSaved(true);
        setShowCreatedDialog(true);
        sendNotification({
          type: "success",
          title: "Agent created",
          description: "Agent created!",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Agent saved",
          description: "Your agent has been successfully saved",
        });
      }
    }, 700);
  };

  const handleSave = () => {
    if (isEditorGateVisible) {
      sendNotification({
        type: "error",
        title: "Cannot save agent",
        description: "Add yourself as an editor before saving changes.",
      });
      return;
    }
    if (instructionsLength === 0) {
      sendNotification({
        type: "error",
        title: "Cannot save agent",
        description: hasSuggestions
          ? "Instructions are required. Review pending suggestion(s) first."
          : "Instructions are required.",
      });
      return;
    }
    const validationError =
      validateAgentName(name) ??
      (!description.trim() ? "Agent description is required" : null);
    if (validationError) {
      sendNotification({
        type: "error",
        title: isSaved ? "Agent edition failed." : "Agent creation failed.",
        description: validationError,
      });
      return;
    }
    if (!isDirty && mode !== "duplicate") {
      sendNotification({
        type: "info",
        title: "No changes to save",
        description: "This agent is already up to date.",
      });
      return;
    }
    if (hasSuggestions) {
      setShowPendingSuggestions(true);
      return;
    }
    if (personalTools.length > 0) {
      setShowPersonalConnections(true);
      return;
    }
    finishSave();
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscard(true);
      return;
    }
    onClose?.();
  };

  const handleAddCapabilities = (skills: ManagedSkill[], tools: MockTool[]) => {
    setAddedSkills((prev) => [
      ...prev,
      ...skills
        .filter((skill) => !prev.some((entry) => entry.skill.id === skill.id))
        .map((skill) => ({ skill })),
    ]);
    setAddedTools((prev) => [
      ...prev,
      ...tools
        .filter((tool) => !prev.some((entry) => entry.tool.id === tool.id))
        .map((tool) => ({ key: tool.id, tool, configuration: null })),
    ]);
    markDirty();
  };

  const handleSaveToolConfiguration = (
    tool: MockTool,
    configuration: ToolConfiguration,
    existingKey: string | null
  ) => {
    setAddedTools((prev) =>
      existingKey
        ? prev.map((entry) =>
            entry.key === existingKey ? { ...entry, configuration } : entry
          )
        : [...prev, { key: `${tool.id}-${Date.now()}`, tool, configuration }]
    );
    markDirty();
  };

  const handleSaveKnowledge = (configuration: KnowledgeConfiguration) => {
    setKnowledge((prev) =>
      prev.some((entry) => entry.key === configuration.key)
        ? prev.map((entry) =>
            entry.key === configuration.key ? configuration : entry
          )
        : [...prev, configuration]
    );
    markDirty();
  };

  const handleRemoveTrigger = (trigger: BuilderTrigger) => {
    setTriggers((prev) => prev.filter((entry) => entry.id !== trigger.id));
    markDirty();
    sendNotification({
      type: "success",
      title: `Successfully removed ${trigger.name}`,
      description: `Trigger "${trigger.name}" will be removed when you save the agent.`,
    });
  };

  const handleOpenAgentDetails = (agent: Agent) => {
    sendNotification({
      type: "info",
      title: agent.name,
      description: "Agent details open in a sheet in the product.",
    });
  };

  const knowledgeCards = knowledge.map((entry) => {
    const spaceNames = Array.from(
      new Set(
        entry.nodeIds
          .map((id) => getKnowledgeNodeById(id)?.spaceId)
          .filter(Boolean)
      )
    )
      .map((id) => getBuilderSpaceById(id as string)?.name)
      .filter(Boolean)
      .join(", ");
    return (
      <ActionCard
        key={entry.key}
        icon={BookOpen01}
        label={entry.name || "Knowledge"}
        description={`${entry.nodeIds.length} source${entry.nodeIds.length === 1 ? "" : "s"} from ${spaceNames || "your spaces"}`}
        cardContainerClassName="h-28"
        canAdd={false}
        onClick={() =>
          setKnowledgeSheet({ open: true, mode: "edit", initial: entry })
        }
        onRemove={() => {
          setKnowledge((prev) =>
            prev.filter((candidate) => candidate.key !== entry.key)
          );
          markDirty();
        }}
      />
    );
  });

  // ----- panels -----------------------------------------------------------
  const leftPanel = (
    <div className="flex h-full flex-col">
      <BarHeader
        variant="default"
        className="mx-4"
        title={headerTitle}
        rightActions={
          <Button
            size="sm"
            variant="ghost"
            icon={XClose}
            onClick={handleCancel}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1" ref={setScrollContainer}>
        <div className="mx-auto w-full max-w-[85ch] space-y-8 px-8 py-6">
          {isEditorGateVisible ? (
            <EditorGateMessage
              isBecoming={isBecomingEditor}
              onBecomeEditor={() => {
                setIsBecomingEditor(true);
                window.setTimeout(() => {
                  setIsBecomingEditor(false);
                  setIsEditorGateVisible(false);
                  setEditorIds((prev) =>
                    Array.from(new Set([...prev, CURRENT_USER.id]))
                  );
                }, 700);
              }}
            />
          ) : null}
          <IdentityHeader
            name={name}
            onNameChange={(value) => {
              setName(value);
              markDirty();
            }}
            description={description}
            onDescriptionChange={(value) => {
              setDescription(value);
              markDirty();
            }}
            avatar={avatar}
            onAvatarChange={(value) => {
              setAvatar(value);
              markDirty();
            }}
            scope={scope}
            onScopeChange={(value) => {
              setScope(value);
              markDirty();
            }}
            canPublish
            editorIds={editorIds}
            onEditorsChange={(ids) => {
              setEditorIds(ids);
              markDirty();
            }}
            tagIds={tagIds}
            onTagsChange={(ids) => {
              setTagIds(ids);
              markDirty();
            }}
            selectedSpaceIds={selectedSpaceIds}
          />
          <InstructionsSection
            editorRef={editorRef}
            scrollContainer={scrollContainer}
            isNewAgent={isNewAgent}
            textLength={instructionsLength}
            onTextChange={handleInstructionsChange}
            onEditorBlur={handleEditorBlur}
            onAskSidekick={() => {
              setIsPreviewPanelOpen(true);
              setRightTab("sidekick");
            }}
            hasSuggestions={hasSuggestions}
            onSuggestionsChange={setHasSuggestions}
            onAcceptAllSuggestions={() => {
              editorRef.current?.acceptAllSuggestions();
              setHasSuggestions(false);
              markDirty();
            }}
            onRejectAllSuggestions={() => {
              editorRef.current?.rejectAllSuggestions();
              setHasSuggestions(false);
            }}
            onOpenAgentDetails={handleOpenAgentDetails}
          />
          <div className="divide-y divide-border border-y border-border">
            <ModelSection
              selection={modelSelection}
              onChange={(selection) => {
                setModelSelection(selection);
                markDirty();
              }}
            />
            <DataAccessSection
              selectedSpaceIds={selectedSpaceIds}
              onChange={(ids) => {
                setSelectedSpaceIds(ids);
                markDirty();
              }}
              getDependents={spaceDependents}
            />
            <CapabilitiesSection
              addedSkills={addedSkills}
              addedTools={addedTools}
              knowledgeCount={knowledge.length}
              onAdd={handleAddCapabilities}
              onRemoveSkill={(skillId) => {
                setAddedSkills((prev) =>
                  prev.filter((entry) => entry.skill.id !== skillId)
                );
                markDirty();
              }}
              onRemoveTool={(key) => {
                setAddedTools((prev) =>
                  prev.filter((entry) => entry.key !== key)
                );
                markDirty();
              }}
              onSaveConfiguration={handleSaveToolConfiguration}
              onOpenKnowledge={() =>
                setKnowledgeSheet({
                  open: true,
                  mode: "create",
                  initial: emptyKnowledgeConfiguration(),
                })
              }
              knowledgeCards={knowledgeCards}
            />
            <SuggestedPromptsSection
              prompts={suggestedPrompts}
              onChange={(prompts) => {
                setSuggestedPrompts(prompts);
                markDirty();
              }}
            />
            <TriggersSection
              triggers={triggers}
              isLoading={isTriggersLoading}
              onSave={(trigger) => {
                setTriggers((prev) =>
                  prev.some((entry) => entry.id === trigger.id)
                    ? prev.map((entry) =>
                        entry.id === trigger.id ? trigger : entry
                      )
                    : [...prev, trigger]
                );
                markDirty();
              }}
              onRemove={handleRemoveTrigger}
            />
            <AdvancedSection
              modelId={modelSelection.modelId}
              responseFormat={responseFormat}
              onResponseFormatChange={(schema) => {
                setResponseFormat(schema);
                markDirty();
              }}
              ignoreCreditThreshold={ignoreCreditThreshold}
              onIgnoreCreditThresholdChange={(value) => {
                setIgnoreCreditThreshold(value);
                markDirty();
              }}
              isManager
            />
          </div>
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="justify-between"
        leftActions={
          <Button
            size="sm"
            variant="outline"
            label="Cancel"
            onClick={handleCancel}
          />
        }
        rightActions={
          <Button
            size="sm"
            variant="highlight"
            label={isSubmitting ? "Saving..." : "Save"}
            disabled={isSaveDisabled}
            tooltip={
              !isDirty && mode !== "duplicate" ? "No changes yet" : undefined
            }
            isLoading={isSubmitting}
            onClick={handleSave}
          />
        }
      />
    </div>
  );

  const tabs: { value: RightTab; label: string; icon: React.ComponentType }[] =
    [
      ...(isEditorGateVisible
        ? []
        : [{ value: "sidekick" as const, label: "Sidekick", icon: Sidekick }]),
      { value: "preview", label: "Preview", icon: Beaker02 },
      { value: "insights", label: "Insights", icon: BarChart01 },
    ];

  const sidekickContent = isSidekickStarting ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Spinner />
      Starting Sidekick session...
    </div>
  ) : (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <NewConversationContainer>
          <NewConversationMessageGroup
            type="agent"
            name="Sidekick"
            timestamp={sidekickTime}
            avatar={{
              visual: undefined,
              emoji: "🛟",
              backgroundColor: "bg-blue-200",
            }}
            renderName={(groupName) => <span>{groupName}</span>}
          >
            <NewConversationAgentMessage isLastMessage>
              <div className="flex flex-col gap-3">
                <span className="text-xs text-muted-foreground">
                  Completed in 2 sec, without tools.
                </span>
                <div>
                  <p>Not sure where to start?</p>
                  <p>
                    Tell me what you want your agent to do—I'll help you write
                    the instructions and configure it.
                  </p>
                </div>
              </div>
            </NewConversationAgentMessage>
          </NewConversationMessageGroup>
        </NewConversationContainer>
      </div>
      <div className="px-4 pb-4">
        <InputBar placeholder={sidekickPlaceholder} isFloating={false} />
      </div>
    </>
  );

  const previewContent = (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {isPreviewPreparing ? (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            Preparing your agent...
          </div>
        ) : previewHasActivity ? (
          <span>Conversation with the draft agent renders here.</span>
        ) : (
          "Preview your agent here"
        )}
      </div>
      {instructionsLength > 0 ||
      addedTools.length > 0 ||
      addedSkills.length > 0 ? (
        <div className="px-5 py-4">
          <InputBar
            placeholder={previewPlaceholder}
            isFloating={false}
            onSend={() => {
              setIsPreviewPreparing(true);
              window.setTimeout(() => {
                setIsPreviewPreparing(false);
                setPreviewHasActivity(true);
              }, 800);
            }}
          />
        </div>
      ) : null}
    </div>
  );

  const insightsContent = (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6">
      <h2 className="heading-lg text-foreground">Insights</h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <BarChart01 className="h-8 w-8 text-muted-foreground" />
        <span className="heading-base text-foreground">Waiting for data</span>
        <span className="text-sm text-muted-foreground">
          Use your agent or share it with your team to see insights data.
        </span>
      </div>
    </div>
  );

  const rightPanel = isPreviewPanelOpen ? (
    <div className="flex h-full flex-col">
      <div className="mx-4 flex h-14 items-end">
        <ScrollArea orientation="horizontal" className="w-full">
          <Tabs
            value={rightTab}
            onValueChange={(value) => setRightTab(value as RightTab)}
          >
            <TabsList>
              <Button
                size="sm"
                variant="ghost-secondary"
                icon={LayoutRight}
                tooltip="Hide preview"
                onClick={() => setIsPreviewPanelOpen(false)}
              />
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </TabsList>
          </Tabs>
        </ScrollArea>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {rightTab === "sidekick"
          ? sidekickContent
          : rightTab === "preview"
            ? previewContent
            : insightsContent}
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center gap-2 pt-3">
      <Button
        size="sm"
        variant="ghost-secondary"
        icon={LayoutRight}
        tooltip="Open preview"
        onClick={() => setIsPreviewPanelOpen(true)}
      />
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          size="sm"
          variant="ghost"
          icon={tab.icon}
          tooltip={tab.label}
          onClick={() => {
            setRightTab(tab.value);
            setIsPreviewPanelOpen(true);
          }}
        />
      ))}
    </div>
  );

  return (
    <Notification.Area>
      <div className="flex h-dvh flex-row">
        <div className="relative h-full w-full flex-1 flex-col overflow-hidden bg-background text-foreground">
          <main className="flex h-full w-full flex-col items-center">
            {loaded ? (
              <div className="flex h-full w-full">
                <ResizablePanelGroup
                  animateLayoutChanges
                  id="agent-builder-next-layout"
                  autoSaveId="agent-builder-next-layout"
                  direction="horizontal"
                  className="h-full w-full"
                >
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="h-full w-full overflow-hidden">
                      {leftPanel}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle
                    withHandle={isPreviewPanelOpen}
                    disabled={!isPreviewPanelOpen}
                  />
                  <ResizablePanel
                    ref={previewPanelRef}
                    id="preview-panel"
                    defaultSize={50}
                    minSize={
                      isPreviewPanelOpen
                        ? MIN_EXPANDED_RIGHT_PANEL_SIZE
                        : COLLAPSED_RIGHT_PANEL_SIZE
                    }
                    collapsedSize={COLLAPSED_RIGHT_PANEL_SIZE}
                    collapsible
                    onCollapse={() => setIsPreviewPanelOpen(false)}
                    onExpand={() => setIsPreviewPanelOpen(true)}
                    className="overflow-hidden"
                  >
                    <div className="h-full w-full overflow-y-auto">
                      {rightPanel}
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      <KnowledgeSheet
        open={knowledgeSheet.open}
        onOpenChange={(open) =>
          setKnowledgeSheet((prev) => ({ ...prev, open }))
        }
        selectedSpaceIds={selectedSpaceIds.filter((id) =>
          mockBuilderSpaces.some((space) => space.id === id)
        )}
        initial={knowledgeSheet.initial}
        mode={knowledgeSheet.mode}
        onSave={handleSaveKnowledge}
      />
      <PendingSuggestionsDialog
        open={showPendingSuggestions}
        onOpenChange={setShowPendingSuggestions}
        count={1}
        onSaveAnyway={() => {
          if (personalTools.length > 0) {
            setShowPersonalConnections(true);
          } else {
            finishSave();
          }
        }}
      />
      <PersonalConnectionRequiredDialog
        open={showPersonalConnections}
        onOpenChange={setShowPersonalConnections}
        tools={personalTools}
        onSave={finishSave}
      />
      <AgentCreatedDialog
        open={showCreatedDialog}
        onOpenChange={setShowCreatedDialog}
        agentName={name || "Agent"}
        onStartChat={() =>
          sendNotification({
            type: "info",
            title: "Start chat",
            description: "Opens a conversation in the product.",
          })
        }
      />
      <DiscardChangesDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        onDiscard={() => {
          setIsDirty(false);
          onClose?.();
        }}
      />
    </Notification.Area>
  );
}
