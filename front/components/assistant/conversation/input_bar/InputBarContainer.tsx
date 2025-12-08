import { ArrowUpIcon, Button, Chip, cn, TextIcon } from "@dust-tt/sparkle";
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

import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  getDisplayNameFromPastedFileId,
  getPastedFileName,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { MobileToolbar } from "@app/components/assistant/conversation/input_bar/toolbar/MobileToolbar";
import { Toolbar } from "@app/components/assistant/conversation/input_bar/toolbar/Toolbar";
import { ToolsPicker } from "@app/components/assistant/ToolsPicker";
import { VoicePicker } from "@app/components/assistant/VoicePicker";
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
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isNodeCandidate } from "@app/lib/connectors";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { classNames } from "@app/lib/utils";
import type {
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  RichAgentMention,
  RichMention,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  normalizeError,
  toRichAgentMentionType,
} from "@app/types";
import { getSupportedFileExtensions } from "@app/types";

export const INPUT_BAR_ACTIONS = [
  "tools",
  "attachment",
  "agents-list",
  "agents-list-with-actions",
  "voice",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];

export interface InputBarContainerProps {
  allAgents: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: WorkspaceType;
  conversationId: string | null;
  selectedAgent: RichAgentMention | null;
  stickyMentions?: RichMention[];
  actions: InputBarAction[];
  disableAutoFocus: boolean;
  isSubmitting: boolean;
  disableInput: boolean;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onMCPServerViewDeselect: (serverView: MCPServerViewType) => void;
  selectedMCPServerViews: MCPServerViewType[];
}

const InputBarContainer = ({
  allAgents,
  onEnterKeyDown,
  owner,
  conversationId,
  selectedAgent,
  stickyMentions,
  actions,
  disableAutoFocus,
  isSubmitting,
  disableInput,
  fileUploaderService,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  onMCPServerViewSelect,
  onMCPServerViewDeselect,
  selectedMCPServerViews,
}: InputBarContainerProps) => {
  const isMobile = useIsMobile();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const userMentionsEnabled = hasFeature("mentions_v2");

  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);
  const [pastedCount, setPastedCount] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);

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

  const { editor, editorService } = useCustomEditor({
    onEnterKeyDown,
    disableAutoFocus,
    onUrlDetected: handleUrlDetected,
    owner,
    conversationId,
    preferredAgentId: selectedAgent?.id ?? null,
    onInlineText: handleInlineText,
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
              type: "agent",
              id: message.id,
              label: message.name,
            });
            break;
          default:
            assertNever(message);
        }
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

  // Update the editor ref when the editor is created and listen for updates to the editor.
  useEffect(() => {
    const handleUpdate = () => {
      setIsEmpty(editorService.isEmpty());
    };

    if (editorRef.current) {
      editorRef.current.off("update", handleUpdate);
    }

    if (editor) {
      editor.on("update", handleUpdate);
    }
    editorRef.current = editor;

    return () => {
      if (editor) {
        editor.off("update", handleUpdate);
      }
    };
  }, [editor, editorService]);

  const disableTextInput = isSubmitting || disableInput;

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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
    isSpacesLoading,
  ]);

  // When input bar animation is requested, it means the new button was clicked (removing focus from
  // the input bar), we grab it back.
  const { animate } = useContext(InputBarContext);
  useEffect(() => {
    if (animate) {
      // Schedule focus to avoid flushing during render lifecycle.
      queueMicrotask(() => editorService.focusEnd());
    }
  }, [animate, editorService]);

  useHandleMentions(
    editorService,
    stickyMentions,
    selectedAgent,
    disableAutoFocus
  );

  const buttonSize = useMemo(() => {
    return isMobile ? "sm" : "xs";
  }, [isMobile]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal",
    "px-3 sm:pl-4 sm:pt-3.5 pt-3"
  );

  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const isRecording = voiceTranscriberService.status === "recording";

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
        {userMentionsEnabled && (
          <BubbleMenu editor={editor ?? undefined} className="hidden sm:flex">
            <Toolbar editor={editor} className="hidden sm:inline-flex" />
          </BubbleMenu>
        )}
        <div className="flex w-full flex-col py-1.5 sm:pb-2">
          <div className="mb-1 flex flex-wrap items-center px-2">
            {selectedMCPServerViews.map((msv) => (
              <React.Fragment key={msv.sId}>
                {/* Two Chips: one for larger screens (desktop), one for smaller screens (mobile). */}
                <Chip
                  size="xs"
                  label={getMcpServerViewDisplayName(msv)}
                  icon={getIcon(msv.server.icon)}
                  className="m-0.5 hidden bg-background text-foreground dark:bg-background-night dark:text-foreground-night md:flex"
                  onRemove={
                    disableInput
                      ? undefined
                      : () => {
                          onMCPServerViewDeselect(msv);
                        }
                  }
                />
                <Chip
                  size="xs"
                  icon={getIcon(msv.server.icon)}
                  className="m-0.5 flex bg-background text-foreground dark:bg-background-night dark:text-foreground-night md:hidden"
                  onRemove={
                    disableInput
                      ? undefined
                      : () => {
                          onMCPServerViewDeselect(msv);
                        }
                  }
                />
              </React.Fragment>
            ))}
          </div>
          <div className="relative flex w-full items-center justify-between">
            {!isRecording && userMentionsEnabled && (
              <MobileToolbar
                editor={editor}
                className={cn(
                  "sm:hidden",
                  isToolbarOpen
                    ? "pointer-events-auto w-full"
                    : "pointer-events-none hidden w-[120px]"
                )}
                onClose={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  setIsToolbarOpen(false);
                }}
              />
            )}
            <div
              className={cn(
                "flex w-full items-center px-2",
                isToolbarOpen && "opacity-0"
              )}
            >
              {!isRecording && (
                <div className="flex items-center">
                  {userMentionsEnabled && (
                    <Button
                      variant="ghost-secondary"
                      icon={TextIcon}
                      size={buttonSize}
                      className="flex sm:hidden"
                      onClick={setIsToolbarOpen}
                    />
                  )}
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
                        buttonSize={buttonSize}
                        conversationId={conversationId}
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
                      buttonSize={buttonSize}
                    />
                  )}
                  {(actions.includes("agents-list") ||
                    actions.includes("agents-list-with-actions")) && (
                    <AgentPicker
                      owner={owner}
                      size={buttonSize}
                      onItemClick={(c) => {
                        editorService.insertMention(toRichAgentMentionType(c));
                      }}
                      agents={allAgents}
                      showDropdownArrow={false}
                      showFooterButtons={actions.includes(
                        "agents-list-with-actions"
                      )}
                      disabled={disableTextInput}
                    />
                  )}
                </div>
              )}
              <div className="grow" />
              <div className="flex items-center gap-2 md:gap-1">
                {owner.metadata?.allowVoiceTranscription !== false &&
                  actions.includes("voice") && (
                    <VoicePicker
                      voiceTranscriberService={voiceTranscriberService}
                      disabled={disableTextInput}
                      buttonSize={buttonSize}
                    />
                  )}
                <Button
                  size={buttonSize}
                  isLoading={
                    isSubmitting &&
                    voiceTranscriberService.status !== "transcribing"
                  }
                  icon={ArrowUpIcon}
                  variant="highlight"
                  disabled={
                    isEmpty ||
                    disableTextInput ||
                    voiceTranscriberService.status !== "idle"
                  }
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
      </div>
    </div>
  );
};

export default InputBarContainer;
