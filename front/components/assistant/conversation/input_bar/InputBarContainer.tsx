import { ContextUsageIndicator } from "@app/components/assistant/conversation/input_bar/ContextUsageIndicator";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarButtons } from "@app/components/assistant/conversation/input_bar/InputBarButtons";
import { INPUT_BAR_COMPACT_PILL_INNER_CLASSES } from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import {
  getDisplayNameFromPastedFileId,
  getPastedFileName,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import type { InputBarSlashSuggestionCapability } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { CustomEditorProps } from "@app/components/editor/input_bar/useCustomEditor";
import useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import useHandleMentions from "@app/components/editor/input_bar/useHandleMentions";
import useUrlHandler from "@app/components/editor/input_bar/useUrlHandler";
import { getIcon } from "@app/components/resources/resources_icons";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { useVoiceTranscriberService } from "@app/hooks/useVoiceTranscriberService";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isNodeCandidate } from "@app/lib/connectors";
import { useClientType } from "@app/lib/context/clientType";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { classNames } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  isRichUserMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  ArrowUpIcon,
  AttachmentIcon,
  Avatar,
  Button,
  CameraIcon,
  ChevronUpDownIcon,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  GlobeAltIcon,
  PlusIcon,
  RobotIcon,
  TextIcon,
  Toolbar,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  VoicePicker,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InputBarContext } from "./InputBarContext";

const COLLAPSE_TRANSITION = "200ms cubic-bezier(0.34, 1.15, 0.64, 1)";

export const INPUT_BAR_ACTIONS = [
  "capabilities",
  "attachment",
  "agents-list",
  "agents-list-with-actions",
  "turn-into-agent",
  "voice",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];

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
  onShake: () => void;
  conversation?: ConversationWithoutContentType;
  space?: SpaceType;
  disableAutoFocus: boolean;
  disableUserMentions?: boolean;
  fileUploaderService: FileUploaderService;
  getDraft: () => {
    text: string;
    agentMention?: RichAgentMention | null;
  } | null;
  isAgentBuilder?: boolean;
  isCompact?: boolean;
  onExpandInputBar?: () => void;
  onEditorFocusChange?: (isFocused: boolean) => void;
  isSubmitting: boolean;
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  onMCPServerViewDeselect: (serverView: MCPServerViewType) => void;
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  onResetMCPServerViews: () => void;
  owner: WorkspaceType;
  saveDraft: (markdown: string, agentMention?: RichAgentMention | null) => void;
  pendingInputText: string | null;
  selectedAgent: RichAgentMention | null;
  selectedMCPServerViews: MCPServerViewType[];
  stickyMentions?: RichMention[];
  user: UserType | null;
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
  isSubmitting,
  fileUploaderService,
  getDraft,
  isAgentBuilder = false,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  onMCPServerViewSelect,
  onMCPServerViewDeselect,
  selectedMCPServerViews,
  onResetMCPServerViews,
  saveDraft,
  user,
  disableAgentSelector,
  disableInput,
  submitBlockMessage,
  placeholder,
  onShake,
  isCompact = false,
  onExpandInputBar,
  onEditorFocusChange,
}: InputBarContainerProps) => {
  const isSubmitBlocked = submitBlockMessage !== null;
  const isCompactRef = useRef(isCompact);
  isCompactRef.current = isCompact;
  const submitCompactVoiceMessageRef = useRef<(() => Promise<void>) | null>(
    null
  );
  const { subscription } = useAuth();
  const isMobile = useIsMobile();
  const { selectedSingleAgent, setSelectedSingleAgent } =
    useContext(InputBarContext);

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
  const clientType = useClientType();
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
  const shouldEnableSlashSuggestionRef = useRef(shouldEnableSlashSuggestion);
  const onSelectRef = useRef<
    ((capability: InputBarSlashSuggestionCapability) => void) | undefined
  >(undefined);
  selectedMCPServerViewIdsRef.current = selectedMCPServerViewIds;
  shouldEnableSlashSuggestionRef.current = shouldEnableSlashSuggestion;

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
    const agent = agentsById.get(agentId);
    if (agent) {
      setSelectedSingleAgent(toRichAgentMentionType(agent));
    }
  };

  const handleSkillSelect = ({
    sId: skillId,
    name: skillName,
    icon: skillIcon,
  }: SkillWithoutInstructionsAndToolsType) => {
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

  onSelectRef.current = (capability: InputBarSlashSuggestionCapability) => {
    switch (capability.kind) {
      case "skill":
        handleSkillSelect(capability.skill);
        break;
      case "tool":
        onMCPServerViewSelect(capability.serverView);
        break;
      default:
        assertNeverAndIgnore(capability);
    }

    queueMicrotask(() => editorRef.current?.commands.focus());
  };

  // Current space is taken from the conversation (if already set) or from the space prop (if provided).
  const spaceId = conversation?.spaceId ?? space?.sId ?? undefined;

  const { editor, editorService } = useCustomEditor({
    onEnterKeyDown: onEnterKeyDownWithShake,
    disableAutoFocus,
    disableUserMentions,
    onUrlDetected: handleUrlDetected,
    onAgentSelect: onSingleAgentSelect,
    owner,
    conversationId: conversation?.sId,
    spaceId,
    onInlineText: handleInlineText,
    onFirstAgentMentionPasteRef,
    slashSuggestion: {
      enabledRef: shouldEnableSlashSuggestionRef,
      onSelectRef,
      selectedMCPServerViewIdsRef,
    },
    placeholderOverride: disableInput ? submitBlockMessage : placeholder,
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

  const voiceTranscriberService = useVoiceTranscriberService({
    owner,
    fileUploaderService,
    onTranscribeComplete: (transcript) => {
      for (const message of transcript) {
        switch (message.type) {
          case "text":
            editorService.insertText(message.text);
            break;
          case "mention": {
            const agent = agentsById.get(message.id);
            if (agent) {
              handleSingleAgentSelect(toRichAgentMentionType(agent));
            }
            break;
          }
          default:
            assertNever(message);
        }
      }
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

  // Ref to expose the current selectedSingleAgent to the editor update listener
  // without re-registering it on every selection change.
  const selectedSingleAgentRef = useRef(selectedSingleAgent);
  selectedSingleAgentRef.current = selectedSingleAgent;

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
    saveDraftRef.current(
      editorIsEmpty ? "" : markdown,
      selectedSingleAgentRef.current
    );
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
    if (currentEditor) {
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

  // When input bar animation is requested, it means the new button was clicked (removing focus from
  // the input bar), we grab it back.
  const { animate, captureActions } = useContext(InputBarContext);

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
    if (animate) {
      // Schedule focus to avoid flushing during render lifecycle.
      queueMicrotask(() => editorService.focusEnd());
    }
  }, [animate, editorService]);

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

  // Restore draft text when switching conversations (including new conversations).
  // Agent selection is handled by useHandleMention.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !editor.isInitialized
    ) {
      return;
    }

    // Only restore draft if editor is empty to avoid overwriting existing content.
    if (!editorService.isEmpty()) {
      return;
    }

    const draft = getDraft();

    if (draft) {
      // Schedule content restoration to avoid flushing during render lifecycle.
      queueMicrotask(() =>
        editorService.setContent(draft.text, { focus: !disableAutoFocus })
      );
      return;
    }

    // No draft — insert sticky user mentions into the editor
    const stickyUserMentions = stickyMentions?.filter(isRichUserMention) ?? [];
    if (stickyUserMentions.length > 0) {
      editorService.resetWithMentions(stickyUserMentions, disableAutoFocus);
    }
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
    isAgentBuilder,
    pendingInputText,
    selectedAgent,
    stickyMentions,
  });

  const buttonSize = useMemo(() => {
    return isMobile ? "sm" : "xs";
  }, [isMobile]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitDisabled =
    (isEmpty && !canSubmitEmpty) ||
    isSubmitting ||
    isSubmitBlocked ||
    voiceTranscriberService.status !== "idle";

  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const hideCapabilities = startsWithUserMention && !selectedSingleAgent;

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal",
    "px-3 sm:pl-4 pt-3 sm:pt-3.5"
  );

  const isRecording = voiceTranscriberService.status === "recording";
  const isVoiceActive = voiceTranscriberService.status !== "idle";

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
    if (!prevIsCompactRef.current && isCompact) {
      editorService.blur();
    } else if (prevIsCompactRef.current && !isCompact) {
      editorService.focusEnd();
      if (editor && !editor.isDestroyed) {
        requestAnimationFrame(() => {
          editor.view.dispatch(editor.state.tr);
        });
      }
    }
    prevIsCompactRef.current = isCompact;
  }, [editor, editorService, isCompact]);

  return (
    <>
      {isCompact && (
        <div
          className={cn(
            INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
            "relative w-auto px-1 sm:pt-0",
            isVoiceActive && "pl-2"
          )}
        >
          {!isVoiceActive && (
            <>
              <div
                aria-label={
                  selectedSingleAgent
                    ? `Selected agent: ${selectedSingleAgent.label}`
                    : "No agent selected"
                }
                className="inline-flex min-w-0 max-w-24 items-center gap-1"
              >
                {selectedSingleAgent ? (
                  <>
                    <Avatar
                      size="xxs"
                      visual={selectedSingleAgent.pictureUrl}
                    />
                    <span className="truncate copy-xs text-muted-foreground dark:text-muted-foreground-night">
                      {selectedSingleAgent.label}
                    </span>
                  </>
                ) : (
                  <>
                    <RobotIcon className="h-3.5 w-3.5 shrink-0 text-faint dark:text-faint-night" />
                    <span className="truncate copy-xs text-faint dark:text-faint-night">
                      Agent
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="ghost-secondary"
                icon={ChevronUpDownIcon}
                size="xs"
                tooltip="Expand input"
                disabled={disableInput}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onExpandInputBar?.();
                }}
              />
            </>
          )}
          {!subscription.plan.isByok &&
            owner.metadata?.allowVoiceTranscription !== false &&
            actions.includes("voice") && (
              <VoicePicker
                status={voiceTranscriberService.status}
                level={voiceTranscriberService.level}
                elapsedSeconds={voiceTranscriberService.elapsedSeconds}
                onRecordStart={voiceTranscriberService.startRecording}
                onRecordStop={voiceTranscriberService.stopRecording}
                size="xs"
                showStopLabel={false}
                disabled={disableInput}
              />
            )}
        </div>
      )}
      <div
        id="InputBarContainer"
        className={cn(
          "relative flex flex-1 cursor-text flex-row sm:pt-0",
          isCompact &&
            "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        )}
        aria-hidden={isCompact}
        onClick={(e) => {
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
                "max-h-[40vh] min-h-14 sm:min-h-16"
              )}
            />
          </div>
          <BubbleMenu
            editor={editor ?? undefined}
            className={cn("flex", isMobile && "hidden")}
          >
            {editor && (
              <Toolbar className={cn("inline-flex", isMobile && "hidden")}>
                <ToolBarContent editor={editor} />
              </Toolbar>
            )}
          </BubbleMenu>
          <div
            className={cn("flex w-full flex-col", "py-1.5 sm:pb-2")}
            style={{
              transition: `padding ${COLLAPSE_TRANSITION}`,
            }}
          >
            <div className="mb-1 flex flex-wrap items-center px-2">
              {selectedMCPServerViews.map((msv) => (
                <React.Fragment key={msv.sId}>
                  {/* Two Chips: one for larger screens (desktop), one for smaller screens (mobile). */}
                  <Chip
                    size="xs"
                    label={getMcpServerViewDisplayName(msv)}
                    icon={getIcon(msv.server.icon)}
                    className="m-0.5 hidden bg-background text-foreground dark:bg-background-night dark:text-foreground-night xs:flex"
                    onRemove={() => {
                      onMCPServerViewDeselect(msv);
                    }}
                  />
                  <Chip
                    size="xs"
                    icon={getIcon(msv.server.icon)}
                    className="m-0.5 flex bg-background text-foreground dark:bg-background-night dark:text-foreground-night xs:hidden"
                    onRemove={() => {
                      onMCPServerViewDeselect(msv);
                    }}
                  />
                </React.Fragment>
              ))}
            </div>
            <div className="relative flex w-full items-center justify-between">
              {!isRecording && editor && (
                <Toolbar
                  variant="overlay"
                  className={cn(
                    isToolbarOpen
                      ? "pointer-events-auto w-full"
                      : "pointer-events-none hidden w-[120px]",
                    !isMobile && "hidden"
                  )}
                  onClose={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setIsToolbarOpen(false);
                  }}
                >
                  <ToolBarContent editor={editor} />
                </Toolbar>
              )}
              <div
                className={cn(
                  "flex w-full items-center px-2",
                  isToolbarOpen && "opacity-0"
                )}
              >
                {!isRecording && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost-secondary"
                      icon={TextIcon}
                      size={buttonSize}
                      className={cn("flex", !isMobile && "hidden")}
                      onClick={() => setIsToolbarOpen(!isToolbarOpen)}
                    />
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
                      isInputDisabled={disableInput}
                      onAgentRemove={() => setSelectedSingleAgent(null)}
                      onMCPServerViewSelect={onMCPServerViewSelect}
                      onNodeSelect={onNodeSelect}
                      onNodeUnselect={onNodeUnselect}
                      onSkillSelect={handleSkillSelect}
                      owner={owner}
                      selectedAgent={selectedSingleAgent}
                      selectedMCPServerViews={selectedMCPServerViews}
                      space={space}
                      user={user}
                    />
                  </div>
                )}
                <div className="grow" />
                <div className="flex items-center gap-2 md:gap-1" />
              </div>
            </div>
          </div>
          <div
            className={cn("absolute bottom-2 right-2 flex items-center gap-2")}
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
                        icon={PlusIcon}
                        size={buttonSize}
                        disabled={disableInput}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions.includes("attachment") && (
                        <DropdownMenuItem
                          icon={AttachmentIcon}
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
                            icon={GlobeAltIcon}
                            label="Attach page content"
                            disabled={
                              disableInput ||
                              captureActions.isCapturing ||
                              fileUploaderService.isProcessingFiles
                            }
                            onClick={() => captureActions.onCapture("text")}
                            endComponent={
                              <DropdownMenuShortcut
                                shortcut={pageShortcut}
                                className="text-xs text-faint dark:text-faint-night"
                              />
                            }
                          />
                          <DropdownMenuItem
                            icon={CameraIcon}
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
                                className="text-xs text-faint dark:text-faint-night"
                              />
                            }
                          />
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
            <div className="flex items-center">
              {conversation && (
                <ContextUsageIndicator
                  buttonSize={buttonSize}
                  owner={owner}
                  conversationId={conversation?.sId}
                />
              )}
              {!subscription.plan.isByok &&
                owner.metadata?.allowVoiceTranscription !== false &&
                actions.includes("voice") && (
                  <VoicePicker
                    status={voiceTranscriberService.status}
                    level={voiceTranscriberService.level}
                    elapsedSeconds={voiceTranscriberService.elapsedSeconds}
                    onRecordStart={voiceTranscriberService.startRecording}
                    onRecordStop={voiceTranscriberService.stopRecording}
                    size={buttonSize}
                    showStopLabel={!isMobile}
                    disabled={disableInput}
                  />
                )}
            </div>
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
                    isLoading={
                      isSubmitting &&
                      voiceTranscriberService.status !== "transcribing"
                    }
                    icon={ArrowUpIcon}
                    variant={isSubmitBlocked ? "ghost-secondary" : "highlight"}
                    disabled={isSubmitDisabled}
                    onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
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
          </div>
        </div>
      </div>
    </>
  );
};

export default InputBarContainer;
