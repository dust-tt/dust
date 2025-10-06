import { ArrowUpIcon, Button, Chip } from "@dust-tt/sparkle";
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

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { MentionDropdown } from "@app/components/assistant/conversation/input_bar/editor/MentionDropdown";
import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { CustomEditorProps } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/components/assistant/conversation/input_bar/editor/useHandleMentions";
import { useMentionDropdown } from "@app/components/assistant/conversation/input_bar/editor/useMentionDropdown";
import useUrlHandler from "@app/components/assistant/conversation/input_bar/editor/useUrlHandler";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  getDisplayNameFromPastedFileId,
  getPastedFileName,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { ToolsPicker } from "@app/components/assistant/ToolsPicker";
import { VoicePicker } from "@app/components/assistant/VoicePicker";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { useVoiceTranscriberService } from "@app/hooks/useVoiceTranscriberService";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getIcon } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isNodeCandidate } from "@app/lib/connectors";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";
import { assertNever, normalizeError } from "@app/types";
import { getSupportedFileExtensions } from "@app/types";

export const INPUT_BAR_ACTIONS = [
  "tools",
  "attachment",
  "assistants-list",
  "assistants-list-with-actions",
  "voice",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: WorkspaceType;
  selectedAssistant: AgentMention | null;
  stickyMentions?: AgentMention[];
  actions: InputBarAction[];
  disableAutoFocus: boolean;
  disableSendButton: boolean;
  disableTextInput: boolean;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onMCPServerViewDeselect: (serverView: MCPServerViewType) => void;
  selectedMCPServerViews: MCPServerViewType[];
}

const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  owner,
  selectedAssistant,
  stickyMentions,
  actions,
  disableAutoFocus,
  disableSendButton,
  disableTextInput,
  fileUploaderService,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  onMCPServerViewSelect,
  onMCPServerViewDeselect,
  selectedMCPServerViews,
}: InputBarContainerProps) => {
  const isMobile = useIsMobile();
  const featureFlags = useFeatureFlags({ workspaceId: owner.sId });
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);
  const [pastedCount, setPastedCount] = useState(0);

  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNode | null>(null);

  // Create a ref to hold the editor instance
  const editorRef = useRef<Editor | null>(null);
  const pastedAttachmentIdsRef = useRef<Set<string>>(new Set());

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

  const insertPastedAttachmentChip = useCallback(
    ({
      fileId,
      title,
      from,
      to,
    }: {
      fileId: string;
      title: string;
      from: number;
      to: number;
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
          attrs: { fileId, title },
          text: `:pasted_attachment[${title}]{fileId=${fileId}}`,
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

  // Pass the editor ref to the mention dropdown hook
  const mentionDropdown = useMentionDropdown(suggestions, editorRef);

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    disableAutoFocus,
    onUrlDetected: handleUrlDetected,
    suggestionHandler: mentionDropdown.getSuggestionHandler(),
    owner,
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

  const voiceTranscriberService = useVoiceTranscriberService({
    owner,
    fileUploaderService,
    onTranscribeComplete: (transcript) => {
      for (const message of transcript) {
        switch (message.type) {
          case "text":
            editorService.insertText(message.text);
            break;
          case "mention":
            editorService.insertMention({
              id: message.id,
              label: message.name,
            });
            break;
          default:
            assertNever(message);
        }
      }
    },
  });

  // Update the editor ref when the editor is created.
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Disable the editor when disableTextInput is true.
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disableTextInput);
    }
  }, [editor, disableTextInput]);

  useUrlHandler(editor, selectedNode, nodeOrUrlCandidate, handleUrlReplaced);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    disabled: !nodeOrUrlCandidate,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces?.map((space) => [space.sId, space]) || []),
    [spaces]
  );

  const sendNotification = useSendNotification();

  const { searchResultNodes, isSearchLoading } = useSpacesSearch(
    isNodeCandidate(nodeOrUrlCandidate)
      ? {
          // NodeIdSearchParams
          nodeIds: nodeOrUrlCandidate?.node ? [nodeOrUrlCandidate.node] : [],
          includeDataSources: false,
          owner,
          viewType: "all",
          disabled: isSpacesLoading || !nodeOrUrlCandidate,
          spaceIds: spaces.map((s) => s.sId),
        }
      : {
          // TextSearchParams
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          search: nodeOrUrlCandidate?.url || "",
          searchSourceUrls: true,
          includeDataSources: false,
          owner,
          viewType: "all",
          disabled: isSpacesLoading || !nodeOrUrlCandidate,
          spaceIds: spaces.map((s) => s.sId),
        }
  );

  useEffect(() => {
    if (!nodeOrUrlCandidate || !onNodeSelect || isSearchLoading) {
      return;
    }

    if (searchResultNodes.length > 0) {
      const nodesWithViews = searchResultNodes.flatMap((node) => {
        const { dataSourceViews, ...rest } = node;
        return dataSourceViews.map((view) => ({
          ...rest,
          dataSourceView: view,
          spacePriority: getSpaceAccessPriority(spacesMap[view.spaceId]),
          spaceName: spacesMap[view.spaceId]?.name,
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
        const sortedNodes = nodes.sort(
          (a, b) =>
            b.spacePriority - a.spacePriority ||
            a.spaceName.localeCompare(b.spaceName)
        );
        const node = sortedNodes[0];
        onNodeSelect(node);
        setSelectedNode(node);
        return;
      }
    }

    sendNotification({
      title: "No match for URL",
      description: `Pasted URL does not match any content in knowledge. ${nodeOrUrlCandidate?.provider === "microsoft" ? "(Microsoft URLs are not supported)" : ""}`,
      type: "info",
    });
    setNodeOrUrlCandidate(null);
  }, [
    searchResultNodes,
    onNodeSelect,
    isSearchLoading,
    editorService,
    spacesMap,
    nodeOrUrlCandidate,
    sendNotification,
  ]);

  // When input bar animation is requested it means the new button was clicked (removing focus from
  // the input bar), we grab it back.
  const { animate } = useContext(InputBarContext);
  useEffect(() => {
    if (animate) {
      editorService.focusEnd();
    }
  }, [animate, editorService]);

  useHandleMentions(
    editorService,
    agentConfigurations,
    stickyMentions,
    selectedAssistant,
    disableAutoFocus
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal",
    "px-3 sm:pl-4 sm:pt-3.5 pt-3"
  );

  return (
    <div
      id="InputBarContainer"
      className="relative flex flex-1 cursor-text flex-row sm:pt-0"
      onClick={(e) => {
        // If e.target is not a child of a div with class "tiptap", then focus on the editor
        if (!(e.target instanceof HTMLElement && e.target.closest(".tiptap"))) {
          editorService.focusEnd();
        }
      }}
    >
      <div className="flex w-0 flex-grow flex-col">
        <EditorContent
          disabled={disableTextInput}
          editor={editor}
          className={classNames(
            contentEditableClasses,
            "scrollbar-hide",
            "overflow-y-auto",
            disableTextInput && "cursor-not-allowed",
            "max-h-[40vh] min-h-14 sm:min-h-16"
          )}
        />
        <div className="flex w-full flex-col px-2 py-1.5 sm:pb-2">
          <div className="mb-1 flex flex-wrap items-center">
            {selectedMCPServerViews.map((msv) => (
              <>
                <Chip
                  key={msv.sId}
                  size="xs"
                  label={getMcpServerViewDisplayName(msv)}
                  icon={getIcon(msv.server.icon)}
                  className="m-0.5 hidden bg-background text-foreground dark:bg-background-night dark:text-foreground-night md:flex"
                  onRemove={() => {
                    onMCPServerViewDeselect(msv);
                  }}
                />
                <Chip
                  key={`mobile-${msv.sId}`}
                  size="xs"
                  icon={getIcon(msv.server.icon)}
                  className="m-0.5 flex bg-background text-foreground dark:bg-background-night dark:text-foreground-night md:hidden"
                  onRemove={() => {
                    onMCPServerViewDeselect(msv);
                  }}
                />
              </>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {actions.includes("attachment") && (
                <>
                  <input
                    accept={getSupportedFileExtensions().join(",")}
                    onChange={async (e) => {
                      await fileUploaderService.handleFileChange(e);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                      editorService.focusEnd();
                    }}
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    type="file"
                    multiple={true}
                  />
                  <InputBarAttachmentsPicker
                    fileUploaderService={fileUploaderService}
                    owner={owner}
                    isLoading={false}
                    onNodeSelect={onNodeSelect}
                    onNodeUnselect={onNodeUnselect}
                    attachedNodes={attachedNodes}
                    disabled={disableTextInput}
                  />
                </>
              )}
              {actions.includes("tools") && (
                <ToolsPicker
                  owner={owner}
                  selectedMCPServerViews={selectedMCPServerViews}
                  onSelect={onMCPServerViewSelect}
                  onDeselect={onMCPServerViewDeselect}
                  disabled={disableTextInput}
                />
              )}
              {(actions.includes("assistants-list") ||
                actions.includes("assistants-list-with-actions")) && (
                <AssistantPicker
                  owner={owner}
                  size="xs"
                  onItemClick={(c) => {
                    editorService.insertMention({ id: c.sId, label: c.name });
                  }}
                  assistants={allAssistants}
                  showDropdownArrow={false}
                  showFooterButtons={actions.includes(
                    "assistants-list-with-actions"
                  )}
                  disabled={disableTextInput}
                />
              )}
            </div>
            <div className="grow" />
            <div className="flex items-center gap-2 md:gap-1">
              {featureFlags.hasFeature("simple_audio_transcription") &&
                actions.includes("voice") && (
                  <VoicePicker
                    voiceTranscriberService={voiceTranscriberService}
                    disabled={disableTextInput}
                  />
                )}
              <Button
                size="xs"
                isLoading={disableSendButton}
                icon={ArrowUpIcon}
                variant="highlight"
                disabled={
                  editorService.isEmpty() ||
                  disableSendButton ||
                  voiceTranscriberService.isRecording ||
                  voiceTranscriberService.isTranscribing
                }
                onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (disableAutoFocus) {
                    editorService.blur();
                    // wait a bit for the keyboard to be closed on mobile
                    if (isMobile) {
                      editorService.setLoading(true);
                      await new Promise((resolve) => setTimeout(resolve, 500));
                    }
                  }
                  onEnterKeyDown(
                    editorService.isEmpty(),
                    editorService.getMarkdownAndMentions(),
                    () => {
                      editorService.clearEditor();
                    },
                    editorService.setLoading
                  );
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <MentionDropdown mentionDropdownState={mentionDropdown} />
    </div>
  );
};

export default InputBarContainer;
