import { ContextUsageIndicator } from "@app/components/assistant/conversation/input_bar/ContextUsageIndicator";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarButtons } from "@app/components/assistant/conversation/input_bar/InputBarButtons";
import type { PendingInputText } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { InputBarModelPicker } from "@app/components/assistant/conversation/input_bar/InputBarModelPicker";
import {
  INPUT_BAR_COMPACT_CONTENT_ENTER_ANIMATION_CLASSES,
  INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
  INPUT_BAR_COMPACT_PREVIEW_CLASSES,
} from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import {
  getDisplayNameFromPastedFileId,
  getPastedFileName,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import { useInputBarOverlayTracker } from "@app/components/assistant/conversation/input_bar/useInputBarOverlayTracker";
import { EditorSelectionToolbar } from "@app/components/editor/EditorSelectionToolbar";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { getAvailableInputBarSlashCommands } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { SKILL_NODE_TYPE } from "@app/components/editor/extensions/input_bar/SkillNode";
import type {
  RunCommandSlashCommand,
  SkillSlashCommand,
  ToolSlashCommand,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import {
  isRunCommandSlashCommand,
  isSkillSlashCommand,
  isToolSlashCommand,
  RUN_COMMAND_SLASH_COMMAND_ACTION,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
  SELECT_TOOL_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { CustomEditorProps } from "@app/components/editor/input_bar/useCustomEditor";
import useCustomEditor, {
  INPUT_BAR_DEFAULT_PLACEHOLDER,
} from "@app/components/editor/input_bar/useCustomEditor";
import useHandleMentions from "@app/components/editor/input_bar/useHandleMentions";
import useUrlHandler from "@app/components/editor/input_bar/useUrlHandler";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import { getIcon } from "@app/components/resources/resources_icons";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
import {
  useCompactConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { useVoiceLiveTranscriberService } from "@app/hooks/useVoiceLiveTranscriberService";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isNodeCandidate } from "@app/lib/connectors";
import { useClientType } from "@app/lib/context/clientType";
import { getSpaceIcon } from "@app/lib/spaces";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { useIsMobile, useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { classNames } from "@app/lib/utils";
import { isVoiceTranscriptionAllowed } from "@app/lib/workspace_policies";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  isRichUserMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  ArrowUp,
  Attachment01,
  Button,
  Camera01,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  FilePlus03,
  Globe01,
  Plus,
  Toolbar,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  VoicePicker,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InputBarContext } from "./InputBarContext";

type KnownSlashCommand =
  | RunCommandSlashCommand<InputBarSlashCommand>
  | SkillSlashCommand
  | ToolSlashCommand;

function narrowToKnownSlashCommand(
  item: SlashCommand
): KnownSlashCommand | null {
  if (isRunCommandSlashCommand<InputBarSlashCommand>(item)) {
    return item;
  }
  if (isSkillSlashCommand(item)) {
    return item;
  }
  if (isToolSlashCommand(item)) {
    return item;
  }
  return null;
}

const COLLAPSE_TRANSITION = "200ms cubic-bezier(0.34, 1.15, 0.64, 1)";
const EMPTY_SPACE_IDS: string[] = [];
const EMPTY_SELECTABLE_SPACES: SelectableConversationSpaceType[] = [];
const acceptSelectedSpaceIds = async (spaceIds: string[]) => spaceIds;

export const INPUT_BAR_ACTIONS = [
  "capabilities",
  "attachment",
  "agents-list",
  "agents-list-with-actions",
  "model-picker",
  "turn-into-agent",
  "spaces",
  "voice",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];

export interface DefaultSkillReference {
  sId: string;
  name: string;
  icon: string | null;
}

function readDefaultSkillEditorState(editor: Editor): {
  skillIds: string[];
  hasUserContent: boolean;
} {
  const skillIds: string[] = [];
  let hasUserContent = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === SKILL_NODE_TYPE) {
      if (typeof node.attrs.skillId === "string") {
        skillIds.push(node.attrs.skillId);
      }
      return false;
    }
    if (node.isText) {
      if ((node.text ?? "").trim().length > 0) {
        hasUserContent = true;
      }
    } else if (node.isInline && node.type.name !== "hardBreak") {
      hasUserContent = true;
    }
    return true;
  });
  return { skillIds, hasUserContent };
}

function sameSkillIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export interface InputBarContainerProps {
  actions: InputBarAction[];
  allAgents: LightAgentConfigurationType[];
  attachedNodes: DataSourceViewContentNode[];
  disableAgentSelector: boolean;
  // When true, the editor is made non-editable and every picker (agent,
  // tools, attachment, voice) is disabled. Reserved for states where the user
  // cannot interact at all (e.g. non-owner viewing a conversation with an
  // active wake-up). `submitBlockMessage` on its own only mutes the send
  // button.
  disableInput: boolean;
  submitBlockMessage: string | null;
  placeholder?: string;
  animatePlaceholder?: boolean;
  onShake: () => void;
  conversation?: ConversationWithoutContentType;
  space?: SpaceType;
  disableAutoFocus: boolean;
  disableUserMentions?: boolean;
  // When true, agents cannot be mentioned or selected from the editor (no `@`
  // suggestions, no agent switch on paste). Used to lock a conversation to a
  // single agent (e.g. the agent builder sidekick).
  disableAgentMentions?: boolean;
  fileUploaderService: FileUploaderService;
  getDraft: () => {
    text: string;
    agentMention?: RichAgentMention | null;
    selectedSpaceIds?: string[];
  } | null;
  defaultAgentId?: string | null;
  isDefaultAgentLoading?: boolean;
  lastRequestedModel?: ModelSelectionType | null;
  // Skills pre-inserted into a new conversation's editor, as if manually added.
  defaultSkills?: DefaultSkillReference[];
  isDefaultSkillsLoading?: boolean;
  isAgentBuilder?: boolean;
  isCompact?: boolean;
  onExpandInputBar?: () => void;
  onEditorFocusChange?: (isFocused: boolean) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  onVoiceActiveChange?: (active: boolean) => void;
  isSubmitting: boolean;
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  onMCPServerViewDeselect: (serverView: MCPServerViewLightType) => void;
  onMCPServerViewSelect: (serverView: MCPServerViewLightType) => void;
  modelSelectionRef?: React.MutableRefObject<ModelSelectionType | undefined>;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  onResetMCPServerViews: () => void;
  owner: WorkspaceType;
  saveDraft: (
    markdown: string,
    agentMention?: RichAgentMention | null,
    selectedSpaceIds?: string[]
  ) => void;
  pendingInputText: PendingInputText | null;
  selectedAgent: RichAgentMention | null;
  selectedMCPServerViews: MCPServerViewLightType[];
  selectedSpaceIds?: string[];
  selectableSpaces?: SelectableConversationSpaceType[];
  shouldShowSpacesAction?: boolean;
  isSelectableSpacesLoading?: boolean;
  onSelectedSpaceIdsChange?: (spaceIds: string[]) => Promise<string[] | null>;
  stickyMentions?: RichMention[];
  user: UserType | null;
}

function hasActiveSelectionInEditor(
  editorDom: HTMLElement | undefined
): boolean {
  const selection = window.getSelection();
  return Boolean(
    selection &&
      !selection.isCollapsed &&
      editorDom &&
      selection.anchorNode &&
      editorDom.contains(selection.anchorNode)
  );
}

const InputBarContainer = ({
  allAgents,
  onEnterKeyDown,
  owner,
  conversation,
  space,
  selectedAgent,
  pendingInputText,
  stickyMentions,
  actions,
  disableAutoFocus,
  disableUserMentions,
  disableAgentMentions,
  isSubmitting,
  fileUploaderService,
  getDraft,
  defaultAgentId,
  isDefaultAgentLoading,
  lastRequestedModel = null,
  defaultSkills,
  isDefaultSkillsLoading,
  isAgentBuilder = false,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  onMCPServerViewSelect,
  modelSelectionRef,
  onMCPServerViewDeselect,
  selectedMCPServerViews,
  selectedSpaceIds = EMPTY_SPACE_IDS,
  onResetMCPServerViews,
  onSelectedSpaceIdsChange = acceptSelectedSpaceIds,
  selectableSpaces = EMPTY_SELECTABLE_SPACES,
  shouldShowSpacesAction = false,
  isSelectableSpacesLoading = false,
  saveDraft,
  user,
  disableAgentSelector,
  disableInput,
  submitBlockMessage,
  placeholder,
  animatePlaceholder,
  onShake,
  isCompact = false,
  onEditorFocusChange,
  onOverlayOpenChange,
  onVoiceActiveChange,
}: InputBarContainerProps) => {
  const { setOverlayOpen } = useInputBarOverlayTracker(onOverlayOpenChange);
  const onSuggestionActiveChangeRef = useRef<(active: boolean) => void>(
    () => {}
  );
  onSuggestionActiveChangeRef.current = (active) => {
    setOverlayOpen("editor-suggestion", active);
  };
  const isSubmitBlocked = submitBlockMessage !== null;
  const isCompactRef = useRef(isCompact);
  isCompactRef.current = isCompact;
  const submitCompactVoiceMessageRef = useRef<(() => Promise<void>) | null>(
    null
  );
  const { subscription } = useAuth();
  const isMobile = useIsMobile();
  const clientType = useClientType();
  const {
    selectedSingleAgent,
    setSelectedSingleAgent,
    isLoadingGoTemplate,
    setStickyModelOverride,
  } = useContext(InputBarContext);

  const [startsWithUserMention, setStartsWithUserMention] = useState(false);
  const canSubmitEmpty = !!selectedSingleAgent;

  const [isBlockTooltipOpen, setIsBlockTooltipOpen] = useState(false);
  const blockTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  useEffect(() => {
    return () => {
      if (blockTooltipTimerRef.current) {
        clearTimeout(blockTooltipTimerRef.current);
      }
    };
  }, []);

  const agentsById = useMemo(
    () => new Map(allAgents.map((a) => [a.sId, a])),
    [allAgents]
  );

  // Callback for the editor's @ mention suggestion — sets the selected agent
  // without focusing (the editor already has focus when the user types @).
  const onSingleAgentSelect = (mention: RichMention) => {
    if (isRichAgentMention(mention)) {
      setSelectedSingleAgent(mention);
    }
  };

  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);
  const [pastedCount, setPastedCount] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);
  // The editor plugin captures its options once at initialization. Passing a ref lets the plugin
  // always invoke the latest closure without needing to reinitialize the editor.
  const onFirstAgentMentionPasteRef = useRef<
    ((agentId: string) => void) | undefined
  >(undefined);
  const [isCaptureDropdownOpen, setIsCaptureDropdownOpen] = useState(false);
  const [showKnowledgePicker, setShowKnowledgePicker] = useState(false);
  const plusButtonRef = useRef<HTMLDivElement>(null);
  const isWidthConstrained = useIsWidthConstrained();
  const shouldEnableSlashSuggestion = actions.includes("capabilities");

  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNode | null>(null);

  // Create a ref to hold the editor instance
  const editorRef = useRef<Editor | null>(null);
  const pastedAttachmentIdsRef = useRef<Set<string>>(new Set());
  const attachedNodesRef = useRef(attachedNodes);
  attachedNodesRef.current = attachedNodes;
  const onNodeUnselectRef = useRef(onNodeUnselect);
  onNodeUnselectRef.current = onNodeUnselect;
  // Tracks internalIds of nodes that have a dataSourceLink chip in the editor,
  // so we only sync removal for nodes that were created via URL paste.
  const dataSourceLinkNodeIdsRef = useRef<Set<string>>(new Set());
  const selectedMCPServerViewIds = useMemo(
    () => new Set(selectedMCPServerViews.map((serverView) => serverView.sId)),
    [selectedMCPServerViews]
  );
  const selectedMCPServerViewIdsRef = useRef(selectedMCPServerViewIds);
  const selectedSpaceIdsRef = useRef(selectedSpaceIds);
  const shouldEnableSlashSuggestionRef = useRef(shouldEnableSlashSuggestion);
  // The slash suggestion extension captures its options at editor initialization, while the
  // conversation may only be created after the first message; the ref keeps it current.
  const conversationIdRef = useRef<string | null>(conversation?.sId ?? null);
  conversationIdRef.current = conversation?.sId ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashCommandsRef = useRef<InputBarSlashCommand[]>([]);
  slashCommandsRef.current = getAvailableInputBarSlashCommands({
    hasAttachment: actions.includes("attachment"),
    hasConversation: Boolean(conversation?.sId),
  });
  const onSelectRef = useRef<((item: SlashCommand) => void) | undefined>(
    undefined
  );
  const onDetailsRef = useRef<((item: SlashCommand) => void) | undefined>(
    undefined
  );
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const includeAttachKnowledgeRef = useRef(actions.includes("attachment"));
  includeAttachKnowledgeRef.current = actions.includes("attachment");
  const includePickModelRef = useRef(false);
  includePickModelRef.current = actions.includes("model-picker");
  const modelSelectionCommitRef = useRef<
    ((selection: Selection) => void) | null
  >(null);
  const onModelSelectRef = useRef<((selection: Selection) => void) | undefined>(
    undefined
  );
  onModelSelectRef.current = (selection: Selection) => {
    if (modelSelectionCommitRef.current) {
      modelSelectionCommitRef.current(selection);
      return;
    }
    // Fallback when the toolbar picker isn't mounted yet.
    setStickyModelOverride(selection.toSend);
    if (modelSelectionRef) {
      modelSelectionRef.current = selection.toSend;
    }
  };
  const [selectedSkillIdForDetails, setSelectedSkillIdForDetails] = useState<
    string | null
  >(null);
  const [selectedServerViewForDetails, setSelectedServerViewForDetails] =
    useState<MCPServerViewLightType | null>(null);
  selectedMCPServerViewIdsRef.current = selectedMCPServerViewIds;
  shouldEnableSlashSuggestionRef.current = shouldEnableSlashSuggestion;

  useEffect(() => {
    selectedSpaceIdsRef.current = selectedSpaceIds;
  }, [selectedSpaceIds]);

  const selectableSpacesById = useMemo(
    () => new Map(selectableSpaces.map((space) => [space.sId, space])),
    [selectableSpaces]
  );
  const selectedSpaces = useMemo(
    () =>
      selectedSpaceIds
        .map((spaceId) => selectableSpacesById.get(spaceId))
        .filter((space): space is SelectableConversationSpaceType => !!space),
    [selectableSpacesById, selectedSpaceIds]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const removePastedAttachmentChip = useCallback(
    (fileId: string) => {
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        return;
      }

      editorInstance.commands.command(({ state, tr }) => {
        let removed = false;
        state.doc.descendants((node, pos) => {
          if (
            node.type.name === "pastedAttachment" &&
            node.attrs?.fileId === fileId
          ) {
            tr.delete(pos, pos + node.nodeSize);
            removed = true;
            return false;
          }
          return true;
        });

        if (removed) {
          pastedAttachmentIdsRef.current.delete(fileId);
        }

        return removed;
      });
    },
    [editorRef]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const insertPastedAttachmentChip = useCallback(
    ({
      fileId,
      title,
      from,
      to,
      textContent,
    }: {
      fileId: string;
      title: string;
      from: number;
      to: number;
      textContent: string;
    }) => {
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        return false;
      }

      const { doc } = editorInstance.state;

      let needsLeadingSpace = false;
      if (from > 0) {
        const $from = doc.resolve(from);
        const textBefore = doc.textBetween($from.start(), from, " ");
        needsLeadingSpace = !!textBefore && !/\s$/.test(textBefore);
      }

      const content = [
        ...(needsLeadingSpace ? [{ type: "text", text: " " }] : []),
        {
          type: "pastedAttachment",
          attrs: { fileId, title, textContent },
          text: `:pasted_content[${title}]{pastedId=${fileId}}`,
        },
        { type: "text", text: " " },
      ];

      const success = editorInstance
        .chain()
        .focus()
        .insertContentAt({ from, to }, content)
        .run();

      if (success) {
        pastedAttachmentIdsRef.current.add(fileId);
      }

      return success;
    },
    [editorRef]
  );

  const handleUrlDetected = useCallback(
    (candidate: UrlCandidate | NodeCandidate | null) => {
      if (candidate) {
        setNodeOrUrlCandidate(candidate);
      }
    },
    []
  );

  const handleUrlReplaced = () => {
    setNodeOrUrlCandidate(null);
  };

  const sendNotification = useSendNotification();

  // Context usage provides the model required by the compaction endpoint; both back the /compact
  // slash command. SWR dedupes these with the ContextUsageIndicator calls.
  const { contextUsage, mutateContextUsage } = useConversationContextUsage({
    conversationId: conversation?.sId,
    workspaceId: owner.sId,
    options: { disabled: !conversation?.sId },
  });
  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId: conversation?.sId,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const handleInlineText = useCallback(
    async (fileId: string, textContent: string) => {
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        return;
      }

      try {
        // Find the pasted attachment node to get its position
        let nodePos: number | null = null;
        editorInstance.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "pastedAttachment" &&
            node.attrs?.fileId === fileId
          ) {
            nodePos = pos;
            return false;
          }
          return true;
        });

        if (nodePos === null) {
          return;
        }

        // Replace the chip with the text content
        const node = editorInstance.state.doc.nodeAt(nodePos);
        if (node) {
          editorInstance
            .chain()
            .focus()
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            .deleteRange({ from: nodePos, to: nodePos + node.nodeSize })
            .insertContentAt(nodePos, textContent)
            .run();
        }

        // Remove the file from the uploader service
        fileUploaderService.removeFile(fileId);
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to inline text",
          description: normalizeError(e).message,
        });
      }
    },
    [editorRef, fileUploaderService, sendNotification]
  );

  // Wrap onEnterKeyDown so that a blocked Enter attempt triggers the shake animation.
  const onEnterKeyDownWithShake: typeof onEnterKeyDown = useCallback(
    (isEmpty, markdownAndMentions, resetEditorText, setLoading) => {
      if (isSubmitBlocked) {
        onShake();
        if (blockTooltipTimerRef.current) {
          clearTimeout(blockTooltipTimerRef.current);
        }
        setIsBlockTooltipOpen(true);
        blockTooltipTimerRef.current = setTimeout(
          () => setIsBlockTooltipOpen(false),
          2000
        );
        return;
      }
      onEnterKeyDown(
        isEmpty && !canSubmitEmpty,
        markdownAndMentions,
        resetEditorText,
        setLoading
      );
    },
    [isSubmitBlocked, canSubmitEmpty, onEnterKeyDown, onShake]
  );

  onFirstAgentMentionPasteRef.current = (agentId: string) => {
    if (disableAgentMentions) {
      return;
    }
    const agent = agentsById.get(agentId);
    if (agent) {
      setSelectedSingleAgent(toRichAgentMentionType(agent));
    }
  };

  const handleSkillSelect = ({
    sId: skillId,
    name: skillName,
    icon: skillIcon,
  }: Pick<SkillWithoutInstructionsAndToolsType, "sId" | "name" | "icon">) => {
    editorRef.current
      ?.chain()
      .focus()
      .insertSkillNode({
        skillId,
        skillName,
        skillIcon,
      })
      .run();
  };

  const handleSlashCommandSelect = (command: InputBarSlashCommand) => {
    switch (command.id) {
      case "upload-file":
        if (!fileUploaderService.isProcessingFiles) {
          fileInputRef.current?.click();
        }
        break;
      case "compact":
        if (isCompacting) {
          break;
        }
        // The cached context usage may be missing or stale (the endpoint reports a null model
        // until the latest agent run has usage rows); revalidate on demand before giving up.
        void (async () => {
          const usage = contextUsage?.model
            ? contextUsage
            : await mutateContextUsage();
          if (usage?.model) {
            void compact(usage.model);
          } else {
            sendNotification({
              type: "error",
              title: "Cannot compact conversation",
              description:
                "Compaction requires a completed agent message in the conversation.",
            });
          }
        })();
        break;
      default:
        assertNeverAndIgnore(command.id);
    }
  };

  onSelectRef.current = (rawItem: SlashCommand) => {
    const item = narrowToKnownSlashCommand(rawItem);
    if (!item) {
      return;
    }

    switch (item.action) {
      case RUN_COMMAND_SLASH_COMMAND_ACTION:
        handleSlashCommandSelect(item.data.command);
        break;
      case SELECT_SKILL_SLASH_COMMAND_ACTION:
        handleSkillSelect(item.data.skill);
        break;
      case SELECT_TOOL_SLASH_COMMAND_ACTION:
        onMCPServerViewSelect(item.data.tool.view);
        break;
      default:
        assertNeverAndIgnore(item);
    }

    queueMicrotask(() => editorRef.current?.commands.focus());
  };

  onDetailsRef.current = (rawItem: SlashCommand) => {
    const item = narrowToKnownSlashCommand(rawItem);
    if (!item) {
      return;
    }

    switch (item.action) {
      case RUN_COMMAND_SLASH_COMMAND_ACTION:
        // Static commands have no details sheet.
        break;
      case SELECT_SKILL_SLASH_COMMAND_ACTION:
        setSelectedSkillIdForDetails(item.data.skill.sId);
        break;
      case SELECT_TOOL_SLASH_COMMAND_ACTION:
        setSelectedServerViewForDetails(item.data.tool.view);
        break;
      default:
        assertNeverAndIgnore(item);
    }
  };

  // Current space is taken from the conversation (if already set) or from the space prop (if provided).
  const spaceId = conversation?.spaceId ?? space?.sId ?? undefined;
  const spaceIdRef = useRef<string | null | undefined>(spaceId);
  spaceIdRef.current = spaceId;

  const { editor, editorService } = useCustomEditor({
    onEnterKeyDown: onEnterKeyDownWithShake,
    disableAutoFocus,
    disableUserMentions,
    disableAgentMentions,
    // In the input bar, disabling agent mentions means locking the
    // conversation to its current agent, so also strip any agent mention that
    // reaches the document (e.g. pasted content).
    stripAgentMentions: disableAgentMentions,
    onUrlDetected: handleUrlDetected,
    onAgentSelect: onSingleAgentSelect,
    owner,
    conversationId: conversation?.sId,
    spaceId,
    onInlineText: handleInlineText,
    onFirstAgentMentionPasteRef,
    slashSuggestion: {
      conversationIdRef,
      enabledRef: shouldEnableSlashSuggestionRef,
      onSelectRef,
      onDetailsRef,
      onSkillDetails: setSelectedSkillIdForDetails,
      selectedMCPServerViewIdsRef,
      slashCommandsRef,
      includeAttachKnowledgeRef,
      includePickModelRef,
      attachedNodesRef,
      onModelSelectRef,
      onNodeSelectRef,
      spaceIdRef,
    },
    placeholderOverride: disableInput ? submitBlockMessage : placeholder,
    animatePlaceholder: !disableInput && animatePlaceholder,
    onSuggestionActiveChangeRef,
    onLongTextPaste: async ({ text, from, to }) => {
      let filename = "";
      let inserted = false;
      try {
        const newCount = pastedCount + 1;
        setPastedCount(newCount);
        filename = getPastedFileName(newCount);
        const displayName = getDisplayNameFromPastedFileId(filename);

        inserted = insertPastedAttachmentChip({
          fileId: filename,
          title: displayName,
          from,
          to,
          textContent: text,
        });

        const file = new File([text], filename, {
          type: "text/vnd.dust.attachment.pasted",
        });

        const uploaded = await fileUploaderService.handleFilesUpload([file]);
        if (!(uploaded && uploaded.length > 0)) {
          if (inserted) {
            removePastedAttachmentChip(filename);
            inserted = false;
          }
          sendNotification({
            type: "error",
            title: "Failed to attach pasted text",
            description: "Upload was rejected or failed.",
          });
        }
      } catch (e) {
        if (inserted && filename) {
          removePastedAttachmentChip(filename);
        }
        sendNotification({
          type: "error",
          title: "Failed to attach pasted text",
          description: normalizeError(e).message,
        });
      }
    },
  });

  const editorServiceRef = useRef(editorService);
  editorServiceRef.current = editorService;
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const selectedSingleAgentRef = useRef(selectedSingleAgent);
  selectedSingleAgentRef.current = selectedSingleAgent;
  // Skip auto-save (especially clearDraft on empty) until initial content is restored.
  const hasCompletedInitialContentRestoreRef = useRef(false);

  const saveCurrentDraftWithSelectedSpaces = useCallback(
    (spaceIds: string[]) => {
      if (!hasCompletedInitialContentRestoreRef.current) {
        return;
      }

      const currentEditorService = editorServiceRef.current;
      const { markdown } = currentEditorService.getMarkdownAndMentions();
      saveDraftRef.current(
        currentEditorService.isEmpty() ? "" : markdown,
        selectedSingleAgentRef.current,
        spaceIds
      );
    },
    []
  );

  const handleSelectedSpaceIdsChange = useCallback(
    async (spaceIds: string[]) => {
      const acceptedSpaceIds = await onSelectedSpaceIdsChange(spaceIds);
      if (!acceptedSpaceIds) {
        return;
      }

      saveCurrentDraftWithSelectedSpaces(acceptedSpaceIds);
    },
    [onSelectedSpaceIdsChange, saveCurrentDraftWithSelectedSpaces]
  );

  const handleSelectedSpaceIdsChangeSafely = useCallback(
    (spaceIds: string[]) => {
      void handleSelectedSpaceIdsChange(spaceIds).catch((error) => {
        sendNotification({
          type: "error",
          title: "Failed to update Spaces",
          description: normalizeError(error).message,
        });
      });
    },
    [handleSelectedSpaceIdsChange, sendNotification]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const handleFocus = () => {
      onEditorFocusChange?.(true);
    };
    const handleBlur = () => {
      onEditorFocusChange?.(false);
    };

    editor.on("focus", handleFocus);
    editor.on("blur", handleBlur);
    onEditorFocusChange?.(editor.isFocused);

    return () => {
      editor.off("focus", handleFocus);
      editor.off("blur", handleBlur);
    };
  }, [editor, onEditorFocusChange]);

  useEffect(() => {
    setOverlayOpen("capture-dropdown", isCaptureDropdownOpen);
  }, [isCaptureDropdownOpen, setOverlayOpen]);

  useEffect(() => {
    setOverlayOpen("knowledge-picker", showKnowledgePicker);
  }, [showKnowledgePicker, setOverlayOpen]);

  const handleAgentRemove = useCallback(() => {
    setSelectedSingleAgent(null);
  }, [setSelectedSingleAgent]);
  const handleAgentPickerOpenChange = useCallback(
    (open: boolean) => {
      setOverlayOpen("agent-picker", open);
    },
    [setOverlayOpen]
  );
  const handleCapabilitiesPickerOpenChange = useCallback(
    (open: boolean) => {
      setOverlayOpen("capabilities-picker", open);
    },
    [setOverlayOpen]
  );
  const handlePlusMenuOpenChange = useCallback(
    (open: boolean) => {
      setOverlayOpen("plus-menu", open);
    },
    [setOverlayOpen]
  );

  useEffect(() => {
    // If an attachment disappears from the uploader, remove its chip from the editor
    const currentPastedIds = new Set(
      fileUploaderService.fileBlobs
        .filter(
          (blob) => blob.contentType === "text/vnd.dust.attachment.pasted"
        )
        .map((blob) => blob.id)
    );

    const idsInEditor = Array.from(pastedAttachmentIdsRef.current);
    idsInEditor.forEach((id) => {
      if (!currentPastedIds.has(id)) {
        removePastedAttachmentChip(id);
        pastedAttachmentIdsRef.current.delete(id);
      }
    });
  }, [fileUploaderService.fileBlobs, removePastedAttachmentChip]);

  // Sync: when an attachment card is removed, remove the corresponding
  // dataSourceLink chip(s) from the editor in a single transaction.
  useEffect(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) {
      return;
    }

    const attachedNodeIds = new Set(attachedNodes.map((n) => n.internalId));

    editorInstance.commands.command(({ state, tr }) => {
      let removed = false;
      // Collect positions in reverse order so deletions don't shift later positions.
      const toDelete: { from: number; to: number }[] = [];
      state.doc.descendants((node, pos) => {
        if (
          node.type.name === "dataSourceLink" &&
          node.attrs?.nodeId &&
          !attachedNodeIds.has(String(node.attrs.nodeId))
        ) {
          toDelete.push({ from: pos, to: pos + node.nodeSize });
        }
      });

      for (let i = toDelete.length - 1; i >= 0; i--) {
        tr.delete(toDelete[i].from, toDelete[i].to);
        removed = true;
      }

      return removed;
    });
  }, [attachedNodes]);

  const activeVoiceService = useVoiceLiveTranscriberService({
    owner,
    onPartialTranscript: (text) => {
      editorService.setVoicePartialText(text);
    },
    onTranscribeDelta: (text) => {
      editorService.commitVoicePartialText(text);
    },
    onTranscribeComplete: () => {
      editorService.finalizeVoicePartial();
      if (isCompactRef.current) {
        void submitCompactVoiceMessageRef.current?.();
      }
    },
    onError: (error) => {
      sendNotification({
        type: "error",
        title: "Failed to transcribe voice",
        description: normalizeError(error).message,
      });
    },
  });

  // Keep the editor non-editable while the input is fully disabled (e.g. a
  // non-owner viewing a conversation with an active wake-up). The placeholder
  // reads the block reason via `placeholderOverride`; disabling editability
  // prevents typing. Note: this must not fire for send-button-only blocks
  // (such as "another agent is answering"), otherwise the user loses the
  // ability to steer while the other agent is still generating.
  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    editor.setEditable(!disableInput);
  }, [editor, disableInput]);

  // When a user mention is *newly added* in single-agent mode, deselect the agent
  // and clear side-channel capabilities. Only triggers on the transition from no-user-mention to
  // user-mention so that re-selecting an agent (via card click or URL param) isn't
  // immediately clobbered by the existing @user mention on the next editor update.
  // Uses a ref so the editor listener (registered once in the useEffect below) always
  // calls the latest closure without re-registering the listener on every render.
  const prevUserMentionedRef = useRef(false);
  const onEditorMentionsChangedRef = useRef(
    (_userMentioned: boolean, _startsWithUserMention: boolean) => {}
  );

  onEditorMentionsChangedRef.current = (
    userMentioned: boolean,
    startsWithUserMention: boolean
  ) => {
    const wasUserMentioned = prevUserMentionedRef.current;
    prevUserMentionedRef.current = userMentioned;
    if (startsWithUserMention && !wasUserMentioned) {
      setSelectedSingleAgent(null);
      onResetMCPServerViews();
    }
  };

  const handleEditorUpdate = useCallback(() => {
    const currentEditor = editorRef.current;
    const currentEditorService = editorServiceRef.current;
    const editorIsEmpty = currentEditorService.isEmpty();
    setIsEmpty(editorIsEmpty);

    // Auto-save draft when content changes and track user mentions.
    // Include the selected single agent so the debounced save doesn't
    // overwrite the agent mention saved by the single-agent effect.
    const { markdown, mentions: editorMentions } =
      currentEditorService.getMarkdownAndMentions();
    if (hasCompletedInitialContentRestoreRef.current) {
      saveDraftRef.current(
        editorIsEmpty ? "" : markdown,
        selectedSingleAgentRef.current,
        selectedSpaceIdsRef.current
      );
    }
    const userMentioned = editorMentions.some((m) => m.type === "user");

    // Check if the very first content node in the editor is a user mention.
    let editorStartsWithUserMention = false;
    if (userMentioned && currentEditor) {
      const firstChild = currentEditor.state.doc.firstChild;
      const firstNode = firstChild?.firstChild;
      editorStartsWithUserMention =
        firstNode?.type.name === "mention" && firstNode.attrs.type === "user";
    }
    setStartsWithUserMention(editorStartsWithUserMention);
    onEditorMentionsChangedRef.current(
      userMentioned,
      editorStartsWithUserMention
    );

    // Sync: when a dataSourceLink chip is deleted from the editor, remove
    // the corresponding attached node so the attachment card disappears.
    if (currentEditor && attachedNodesRef.current.length > 0) {
      const chipNodeIds = new Set<string>();
      currentEditor.state.doc.descendants((node) => {
        if (node.type.name === "dataSourceLink" && node.attrs?.nodeId) {
          chipNodeIds.add(String(node.attrs.nodeId));
        }
      });

      // Update the tracked set and unselect nodes whose chip was removed.
      const prevIds = dataSourceLinkNodeIdsRef.current;
      for (const prevId of prevIds) {
        if (!chipNodeIds.has(prevId)) {
          const node = attachedNodesRef.current.find(
            (n) => n.internalId === prevId
          );
          if (node) {
            onNodeUnselectRef.current(node);
          }
        }
      }
      dataSourceLinkNodeIdsRef.current = chipNodeIds;
    }
  }, []);

  // Update the editor ref when the editor is created and listen for updates to the editor.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.off("update", handleEditorUpdate);
    }

    if (editor) {
      editor.on("update", handleEditorUpdate);
    }
    editorRef.current = editor;

    return () => {
      if (editor) {
        editor.off("update", handleEditorUpdate);
      }
    };
  }, [editor, handleEditorUpdate]);

  useUrlHandler(editor, selectedNode, nodeOrUrlCandidate, handleUrlReplaced);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: !nodeOrUrlCandidate,
  });

  const spaceIds = useMemo(() => {
    // We are having a conversation within a specific space, so we only allow datasources/tools from that space and the global space.
    // This is a project v1 limitation.
    if (spaceId) {
      return spaces
        .filter((s) => s.sId === spaceId || s.kind === "global")
        .map((s) => s.sId);
    } else {
      return spaces.map((s) => s.sId);
    }
  }, [spaces, spaceId]);

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces?.map((s) => [s.sId, s]) || []),
    [spaces]
  );

  const { searchResultNodes, isSearchLoading } = useSpacesSearch(
    isNodeCandidate(nodeOrUrlCandidate)
      ? {
          // NodeIdSearchParams
          nodeIds: nodeOrUrlCandidate?.node ? [nodeOrUrlCandidate.node] : [],
          includeDataSources: false,
          owner,
          viewType: "all",
          disabled: isSpacesLoading || !nodeOrUrlCandidate,
          spaceIds,
          prioritizeSpaceAccess: true,
        }
      : {
          // TextSearchParams
          search: nodeOrUrlCandidate?.url ?? "",
          searchSourceUrls: true,
          includeDataSources: false,
          owner,
          viewType: "all",
          disabled: isSpacesLoading || !nodeOrUrlCandidate,
          spaceIds,
          prioritizeSpaceAccess: true,
        }
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (
      !nodeOrUrlCandidate ||
      !onNodeSelect ||
      isSearchLoading ||
      isSpacesLoading
    ) {
      return;
    }

    if (searchResultNodes.length > 0) {
      const nodesWithViews = searchResultNodes.flatMap((node) => {
        const { dataSourceViews, ...rest } = node;

        return dataSourceViews.map((view) => ({
          ...rest,
          dataSourceView: view,
        }));
      });

      const nodes = nodesWithViews.filter(
        (node) =>
          isNodeCandidate(nodeOrUrlCandidate) ||
          // For nodes whose lookup is done on URL, since search was done also
          // on title, we ensure the match was on the URL.
          node.sourceUrl === nodeOrUrlCandidate?.url
      );

      if (nodes.length > 0) {
        const node = nodes[0];
        onNodeSelect(node);
        setSelectedNode(node);
        return;
      }
    }

    setNodeOrUrlCandidate(null);
  }, [
    searchResultNodes,
    onNodeSelect,
    isSearchLoading,
    editorService,
    spacesMap,
    nodeOrUrlCandidate,
    isSpacesLoading,
  ]);

  // When an input bar refocus is requested (e.g. the "New" button was clicked, removing focus from
  // the input bar), we grab focus back.
  const { shouldFocusInput, setShouldFocusInput, captureActions } =
    useContext(InputBarContext);

  const handleSingleAgentSelect = useCallback(
    (mention: RichMention) => {
      if (isRichAgentMention(mention)) {
        setSelectedSingleAgent(mention);
        editorService.focusEnd();
      }
    },
    [setSelectedSingleAgent, editorService]
  );

  const isMac = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }, []);

  const pageShortcut = isMac ? "⇧⌘Y" : "Ctrl+Maj+Y";
  const screenshotShortcut = isMac ? "⇧⌘S" : "Ctrl+Maj+S";

  useEffect(() => {
    // captureActions is defined only in the extension, so the shortcuts won't work in the web app
    if (!captureActions || disableInput) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || !e.shiftKey) {
        return;
      }
      if (captureActions.isCapturing || fileUploaderService.isProcessingFiles) {
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        captureActions.onCapture("text");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        captureActions.onCapture("screenshot");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [captureActions, disableInput, fileUploaderService.isProcessingFiles]);

  useEffect(() => {
    if (shouldFocusInput) {
      // Schedule focus to avoid flushing during render lifecycle.
      queueMicrotask(() => editorService.focusEnd());
      // Consume the flag so a later request (e.g. clicking "New" again) re-runs
      // this effect instead of being swallowed as a no-op state update.
      setShouldFocusInput(false);
    }
  }, [shouldFocusInput, editorService, setShouldFocusInput]);

  // Focus the input bar when the extension panel is opened (content-script sidebar or Front iframe).
  // Not gated by disableAutoFocus: that flag prevents autofocus on mount (to avoid mobile keyboard
  // popping up), but focusing when the user explicitly opens the panel is intentional.
  useEffect(() => {
    if (clientType !== "extension") {
      return;
    }
    // Focus immediately on mount (handles navigation within an already-open panel).
    queueMicrotask(() => editorService.focusEnd());

    const handleWindowFocus = () => {
      queueMicrotask(() => editorService.focusEnd());
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "DUST_SIDEBAR_SHOWN") {
        queueMicrotask(() => editorService.focusEnd());
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("message", handleMessage);
    };
  }, [clientType, editorService]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const shouldBeEditable = !isLoadingGoTemplate;
    if (editor.isEditable === shouldBeEditable) {
      // Keep the loading shimmer in sync without toggling editability (which
      // emits an empty update and would clear the draft before restore runs).
      if (isLoadingGoTemplate) {
        editor.view.dom.classList.add("loading-text");
      } else {
        editor.view.dom.classList.remove("loading-text");
      }
      return;
    }

    editorService.setLoading(isLoadingGoTemplate);
  }, [editor, editorService, isLoadingGoTemplate]);

  const pendingReplaceInputRef = useRef<PendingInputText | null>(null);

  // Apply replace-mode pending text once the editor is ready. The async /go
  // template fetch often completes before TipTap initializes; applying earlier
  // would no-op and the pending payload is already consumed by InputBar.
  useEffect(() => {
    if (pendingInputText?.replace) {
      pendingReplaceInputRef.current = pendingInputText;
    }

    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !editor.isInitialized
    ) {
      return;
    }

    const pending = pendingReplaceInputRef.current;
    if (!pending?.replace) {
      return;
    }

    pendingReplaceInputRef.current = null;
    queueMicrotask(() => {
      editorService.setContent(pending.text, { focus: !disableAutoFocus });
      hasCompletedInitialContentRestoreRef.current = true;
    });
  }, [
    pendingInputText,
    editor,
    editor?.isInitialized,
    editor?.isEditable,
    editorService,
    disableAutoFocus,
  ]);

  // Restore draft text when switching conversations (including new conversations).
  // Agent selection is handled by useHandleMention.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    hasCompletedInitialContentRestoreRef.current = false;

    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !editor.isInitialized
    ) {
      return;
    }

    if (pendingReplaceInputRef.current?.replace) {
      return;
    }

    // Only restore draft if editor is empty to avoid overwriting existing content.
    if (!editorService.isEmpty()) {
      hasCompletedInitialContentRestoreRef.current = true;
      return;
    }

    const draft = getDraft();

    if (draft) {
      // Schedule content restoration to avoid flushing during render lifecycle.
      queueMicrotask(() => {
        editorService.setContent(draft.text, { focus: !disableAutoFocus });
        hasCompletedInitialContentRestoreRef.current = true;
      });
      return;
    }

    // No draft — insert sticky user mentions into the editor
    const stickyUserMentions = stickyMentions?.filter(isRichUserMention) ?? [];
    if (stickyUserMentions.length > 0) {
      editorService.resetWithMentions(stickyUserMentions, disableAutoFocus);
    }

    hasCompletedInitialContentRestoreRef.current = true;
  }, [
    conversation,
    editor,
    editor?.isInitialized,
    editor?.isEditable,
    editorService,
    getDraft,
    stickyMentions,
    disableAutoFocus,
  ]);

  useHandleMentions({
    allAgents,
    conversation,
    disableAutoFocus,
    editorService,
    getDraft,
    defaultAgentId,
    isDefaultAgentLoading,
    isAgentBuilder,
    pendingInputText,
    selectedAgent,
    stickyMentions,
  });

  useEffect(() => {
    if (defaultSkills === undefined) {
      return;
    }
    if (conversation || isAgentBuilder) {
      return;
    }

    if (isDefaultSkillsLoading) {
      return;
    }
    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !editor.isInitialized
    ) {
      return;
    }

    const desiredSkillIds = defaultSkills.map((skill) => skill.sId);

    queueMicrotask(() => {
      if (
        !editor ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !editor.isInitialized
      ) {
        return;
      }

      const { skillIds, hasUserContent } = readDefaultSkillEditorState(editor);

      if (hasUserContent) {
        return;
      }

      if (sameSkillIds(skillIds, desiredSkillIds)) {
        return;
      }

      let chain = editor.chain();
      if (skillIds.length > 0) {
        chain = chain.clearContent();
      }
      for (const skill of defaultSkills) {
        chain = chain.insertSkillNode({
          skillId: skill.sId,
          skillName: skill.name,
          skillIcon: skill.icon,
        });
      }
      chain.run();
    });
  }, [
    conversation,
    defaultSkills,
    isDefaultSkillsLoading,
    isAgentBuilder,
    editor,
    editor?.isInitialized,
    editor?.isEditable,
  ]);

  const buttonSize = useMemo(() => {
    return isMobile ? "sm" : "xs";
  }, [isMobile]);

  const isSubmitDisabled =
    (isEmpty && !canSubmitEmpty) ||
    isSubmitting ||
    isSubmitBlocked ||
    activeVoiceService.status !== "idle";

  const hideCapabilities = startsWithUserMention && !selectedSingleAgent;

  const canShowVoicePicker =
    !subscription.plan.isByok &&
    isVoiceTranscriptionAllowed(owner) &&
    actions.includes("voice") &&
    !isCompact;

  const isDefaultAgentUnavailable =
    !conversation &&
    !isAgentBuilder &&
    !isDefaultAgentLoading &&
    !!defaultAgentId &&
    defaultAgentId !== GLOBAL_AGENTS_SID.DUST &&
    !agentsById.has(defaultAgentId);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 outline-hidden ring-0 focus:border-0 focus:outline-hidden focus:ring-0",
    "whitespace-pre-wrap font-normal text-base",
    "px-3 md:pl-4 pt-3 md:pt-3.5"
  );

  const isRecording = activeVoiceService.status === "recording";
  const isVoiceActive = activeVoiceService.status !== "idle";
  // Keep the send button (and its spinner) while a submit is in flight — the
  // editor clears optimistically — but let the mic own the row while it is
  // recording or transcribing, where it shows a timer and a level meter.
  const showSendButton = !isVoiceActive || isSubmitting;
  const compactPreviewText = editorService.getTrimmedText();
  const compactDisplayPlaceholder =
    (disableInput ? submitBlockMessage : placeholder) ??
    INPUT_BAR_DEFAULT_PLACEHOLDER;

  useEffect(() => {
    onVoiceActiveChange?.(isVoiceActive);
  }, [isVoiceActive, onVoiceActiveChange]);

  submitCompactVoiceMessageRef.current = async () => {
    if (disableAutoFocus) {
      editorService.blur();
      if (isMobile) {
        editorService.setLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 500));
        editorService.setLoading(false);
      }
    }
    await onEnterKeyDownWithShake(
      editorService.isEmpty() && !canSubmitEmpty,
      editorService.getMarkdownAndMentions(),
      () => {
        editorService.clearEditor();
      },
      editorService.setLoading
    );
  };

  const prevIsCompactRef = useRef(isCompact);
  useEffect(() => {
    if (
      prevIsCompactRef.current &&
      !isCompact &&
      editor &&
      !editor.isDestroyed
    ) {
      requestAnimationFrame(() => {
        editor.view.dispatch(editor.state.tr);
      });
    }
    prevIsCompactRef.current = isCompact;
  }, [editor, isCompact]);

  return (
    <>
      <CapabilityDetailsSheets
        owner={owner}
        user={user}
        selectedSkillId={selectedSkillIdForDetails}
        selectedMCPServerView={selectedServerViewForDetails}
        onCloseSkill={() => setSelectedSkillIdForDetails(null)}
        onCloseTool={() => setSelectedServerViewForDetails(null)}
      />

      {isCompact && (
        <div
          className={cn(
            INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
            INPUT_BAR_COMPACT_CONTENT_ENTER_ANIMATION_CLASSES,
            "relative min-w-0 w-full gap-1 px-1 md:pt-0"
          )}
        >
          {!isVoiceActive && (
            <div
              aria-hidden
              className={cn(
                INPUT_BAR_COMPACT_PREVIEW_CLASSES,
                compactPreviewText ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {compactPreviewText || compactDisplayPlaceholder}
            </div>
          )}
          {!subscription.plan.isByok &&
            isVoiceTranscriptionAllowed(owner) &&
            actions.includes("voice") && (
              <div
                className={cn(
                  "flex shrink-0 flex-row items-center",
                  isVoiceActive && "ml-auto"
                )}
                data-compact-voice
              >
                <VoicePicker
                  status={activeVoiceService.status}
                  level={activeVoiceService.level}
                  elapsedSeconds={activeVoiceService.elapsedSeconds}
                  onRecordStart={activeVoiceService.startRecording}
                  onRecordStop={activeVoiceService.stopRecording}
                  size="sm"
                  compact
                  showStopLabel={false}
                  disabled={disableInput}
                />
              </div>
            )}
        </div>
      )}
      <div
        id="InputBarContainer"
        className={cn(
          "relative flex flex-1 cursor-text flex-row transition-opacity duration-200 md:pt-0",
          isCompact &&
            "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        )}
        aria-hidden={isCompact}
        onClick={(e) => {
          // Overlays rendered by our pickers (dropdowns, sub-dropdowns, popovers) are portalled
          // out of this div but stay React descendants, so their clicks still bubble here.
          // Refocusing the editor on those steals focus from the overlay, which makes Radix
          // dismiss it (e.g. clicking a sub-dropdown searchbar would close it).
          if (
            !(e.target instanceof Node) ||
            !e.currentTarget.contains(e.target)
          ) {
            return;
          }
          if (hasActiveSelectionInEditor(editorRef.current?.view.dom)) {
            return;
          }
          // If e.target is not a child of a div with class "tiptap", then focus on the editor
          if (
            !(e.target instanceof HTMLElement && e.target.closest(".tiptap"))
          ) {
            editorService.focusEnd();
          }
        }}
      >
        <div className="flex w-0 flex-grow flex-col">
          <div className="relative">
            <EditorContent
              editor={editor}
              className={classNames(
                contentEditableClasses,
                "scrollbar-hide",
                "overflow-y-auto",
                "max-h-[40vh] min-h-11"
              )}
            />
          </div>
          <EditorSelectionToolbar editor={editor} disabled={isMobile}>
            {editor && (
              <Toolbar className="inline-flex">
                <ToolBarContent editor={editor} />
              </Toolbar>
            )}
          </EditorSelectionToolbar>
          <div
            className={cn("mt-auto flex w-full flex-col", "pt-2 pb-3")}
            style={{
              transition: `padding ${COLLAPSE_TRANSITION}`,
            }}
          >
            <div className="mb-1 flex flex-wrap items-center px-3">
              {selectedMCPServerViews.map((msv) => (
                <React.Fragment key={msv.sId}>
                  {/* Two Chips: one for larger screens (desktop), one for smaller screens (mobile). */}
                  <Chip
                    size="xs"
                    label={getMcpServerViewDisplayName(msv)}
                    icon={getIcon(msv.server.icon)}
                    className="m-0.5 hidden bg-background text-foreground xs:flex"
                    onClick={() => setSelectedServerViewForDetails(msv)}
                    onRemove={() => {
                      onMCPServerViewDeselect(msv);
                    }}
                  />
                  <Chip
                    size="xs"
                    icon={getIcon(msv.server.icon)}
                    className="m-0.5 flex bg-background text-foreground xs:hidden"
                    onClick={() => setSelectedServerViewForDetails(msv)}
                    onRemove={() => {
                      onMCPServerViewDeselect(msv);
                    }}
                  />
                </React.Fragment>
              ))}
              {selectedSpaces.map((selectedSpace) => (
                <Chip
                  key={selectedSpace.sId}
                  size="xs"
                  label={selectedSpace.name}
                  icon={getSpaceIcon(selectedSpace)}
                  className="m-0.5 bg-background text-foreground dark:bg-background-night dark:text-foreground-night"
                  onRemove={
                    conversation?.sId
                      ? undefined
                      : () => {
                          handleSelectedSpaceIdsChangeSafely(
                            selectedSpaceIds.filter(
                              (spaceId) => spaceId !== selectedSpace.sId
                            )
                          );
                        }
                  }
                />
              ))}
            </div>
            <div className="flex min-h-7 w-full items-center">
              <div className={cn("flex w-full items-center px-3")}>
                {!isRecording && (
                  <div
                    className={cn(
                      "flex items-center",
                      isWidthConstrained ? "gap-1" : "gap-1.5"
                    )}
                  >
                    <InputBarButtons
                      actions={actions}
                      allAgents={allAgents}
                      attachedNodes={attachedNodes}
                      buttonSize={buttonSize}
                      clientType={clientType}
                      conversation={conversation}
                      disableAgentSelector={disableAgentSelector}
                      editorService={editorService}
                      fileInputRef={fileInputRef}
                      fileUploaderService={fileUploaderService}
                      handleSingleAgentSelect={handleSingleAgentSelect}
                      hideCapabilities={hideCapabilities}
                      isDefaultAgentUnavailable={isDefaultAgentUnavailable}
                      isInputDisabled={disableInput}
                      lastRequestedModel={lastRequestedModel}
                      onAgentRemove={handleAgentRemove}
                      onMCPServerViewSelect={onMCPServerViewSelect}
                      modelSelectionRef={modelSelectionRef}
                      modelSelectionCommitRef={modelSelectionCommitRef}
                      onNodeSelect={onNodeSelect}
                      onNodeUnselect={onNodeUnselect}
                      onSkillSelect={handleSkillSelect}
                      owner={owner}
                      selectedAgent={selectedSingleAgent}
                      selectedMCPServerViews={selectedMCPServerViews}
                      selectedSpaceIds={selectedSpaceIds}
                      onSelectedSpaceIdsChange={
                        handleSelectedSpaceIdsChangeSafely
                      }
                      spaces={
                        shouldShowSpacesAction ? selectableSpaces : undefined
                      }
                      isSpacesLoading={isSelectableSpacesLoading}
                      canDeselectSelectedSpaces={!conversation?.sId}
                      space={space}
                      user={user}
                      onAgentPickerOpenChange={handleAgentPickerOpenChange}
                      onCapabilitiesPickerOpenChange={
                        handleCapabilitiesPickerOpenChange
                      }
                      onPlusMenuOpenChange={handlePlusMenuOpenChange}
                    />
                  </div>
                )}
                <div className="grow" />
                <div
                  className={cn(
                    "flex items-center",
                    isWidthConstrained ? "gap-1.5" : "gap-2.5"
                  )}
                >
                  {clientType === "extension" && (
                    <>
                      <div ref={plusButtonRef}>
                        <DropdownMenu
                          open={isCaptureDropdownOpen}
                          onOpenChange={setIsCaptureDropdownOpen}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost-secondary"
                              icon={Plus}
                              size={buttonSize}
                              disabled={disableInput}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.includes("attachment") && (
                              <DropdownMenuItem
                                icon={Attachment01}
                                label="Attach knowledge"
                                onClick={() => {
                                  setIsCaptureDropdownOpen(false);
                                  setShowKnowledgePicker(true);
                                }}
                              />
                            )}
                            {captureActions && (
                              <>
                                <DropdownMenuItem
                                  icon={Globe01}
                                  label="Attach page content"
                                  disabled={
                                    disableInput ||
                                    captureActions.isCapturing ||
                                    fileUploaderService.isProcessingFiles
                                  }
                                  onClick={() =>
                                    captureActions.onCapture("text")
                                  }
                                  endComponent={
                                    <DropdownMenuShortcut
                                      shortcut={pageShortcut}
                                      className="text-xs text-faint"
                                    />
                                  }
                                />
                                <DropdownMenuItem
                                  icon={Camera01}
                                  label="Take screenshot"
                                  disabled={
                                    disableInput ||
                                    captureActions.isCapturing ||
                                    fileUploaderService.isProcessingFiles
                                  }
                                  onClick={() =>
                                    captureActions.onCapture("screenshot")
                                  }
                                  endComponent={
                                    <DropdownMenuShortcut
                                      shortcut={screenshotShortcut}
                                      className="text-xs text-faint"
                                    />
                                  }
                                />
                                {captureActions.onSavePageToPod && (
                                  <DropdownMenuItem
                                    icon={FilePlus03}
                                    label="Save page to Pod"
                                    disabled={
                                      disableInput ||
                                      captureActions.isCapturing ||
                                      captureActions.isSavingPageToPod ||
                                      fileUploaderService.isProcessingFiles
                                    }
                                    onClick={() => {
                                      void captureActions.onSavePageToPod?.();
                                    }}
                                  />
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {actions.includes("attachment") && (
                        <InputBarAttachmentsPicker
                          fileUploaderService={fileUploaderService}
                          owner={owner}
                          isLoading={false}
                          onNodeSelect={onNodeSelect}
                          onNodeUnselect={onNodeUnselect}
                          attachedNodes={attachedNodes}
                          buttonSize={buttonSize}
                          toolFileUpload={{
                            useCase: "conversation",
                            useCaseMetadata: {
                              conversationId: conversation?.sId,
                            },
                          }}
                          spaceId={space?.sId}
                          type="dropdown"
                          onFileChange={() => setShowKnowledgePicker(false)}
                          externalOpen={showKnowledgePicker}
                          onExternalOpenChange={setShowKnowledgePicker}
                          anchorRef={plusButtonRef}
                          disabled={disableInput}
                        />
                      )}
                    </>
                  )}
                  <div
                    className={cn(
                      "flex items-center",
                      isWidthConstrained ? "gap-1" : "gap-2"
                    )}
                  >
                    {clientType !== "extension" &&
                      actions.includes("model-picker") && (
                        <InputBarModelPicker
                          agentModel={
                            (selectedSingleAgent &&
                              agentsById.get(selectedSingleAgent.id)?.model) ??
                            null
                          }
                          agentId={selectedSingleAgent?.id ?? null}
                          lastRequestedModel={lastRequestedModel}
                          owner={owner}
                          buttonSize={buttonSize}
                          side={conversation ? "top" : "bottom"}
                          disabled={disableInput}
                          selectionRef={modelSelectionRef}
                          commitApiRef={modelSelectionCommitRef}
                        />
                      )}
                    {conversation && (
                      <ContextUsageIndicator
                        buttonSize={buttonSize}
                        owner={owner}
                        conversationId={conversation?.sId}
                      />
                    )}
                  </div>
                  {canShowVoicePicker && (
                    <VoicePicker
                      status={activeVoiceService.status}
                      level={activeVoiceService.level}
                      elapsedSeconds={activeVoiceService.elapsedSeconds}
                      onRecordStart={activeVoiceService.startRecording}
                      onRecordStop={activeVoiceService.stopRecording}
                      size={buttonSize}
                      showStopLabel={!isWidthConstrained}
                      disabled={disableInput}
                      buttonProps={{ className: "rounded-full" }}
                    />
                  )}
                  {showSendButton && (
                    <TooltipProvider>
                      <TooltipRoot
                        open={isBlockTooltipOpen && submitBlockMessage !== null}
                      >
                        <TooltipTrigger
                          asChild
                          onPointerEnter={() => {
                            if (submitBlockMessage) {
                              setIsBlockTooltipOpen(true);
                            }
                          }}
                          onPointerLeave={() => {
                            if (blockTooltipTimerRef.current) {
                              clearTimeout(blockTooltipTimerRef.current);
                              blockTooltipTimerRef.current = null;
                            }
                            setIsBlockTooltipOpen(false);
                          }}
                        >
                          <Button
                            size={buttonSize}
                            aria-label="Send message"
                            isLoading={
                              isSubmitting &&
                              activeVoiceService.status !== "transcribing"
                            }
                            icon={ArrowUp}
                            variant={
                              isSubmitBlocked ? "ghost-secondary" : "highlight"
                            }
                            disabled={isSubmitDisabled}
                            className="rounded-full"
                            onClick={async (
                              e: React.MouseEvent<HTMLButtonElement>
                            ) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (disableAutoFocus) {
                                editorService.blur();
                                // wait a bit for the keyboard to be closed on mobile
                                if (isMobile) {
                                  editorService.setLoading(true);
                                  await new Promise((resolve) =>
                                    setTimeout(resolve, 500)
                                  );
                                  editorService.setLoading(false);
                                }
                              }
                              onEnterKeyDownWithShake(
                                editorService.isEmpty() && !canSubmitEmpty,
                                editorService.getMarkdownAndMentions(),
                                () => {
                                  editorService.clearEditor();
                                },
                                editorService.setLoading
                              );
                            }}
                          />
                        </TooltipTrigger>
                        {submitBlockMessage && (
                          <TooltipContent>{submitBlockMessage}</TooltipContent>
                        )}
                      </TooltipRoot>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default InputBarContainer;
