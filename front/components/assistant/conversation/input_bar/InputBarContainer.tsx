import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
} from "@dust-tt/sparkle";
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
import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { CustomEditorProps } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/components/assistant/conversation/input_bar/editor/useHandleMentions";
import useUrlHandler from "@app/components/assistant/conversation/input_bar/editor/useUrlHandler";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { classNames } from "@app/lib/utils";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";
import { getSupportedFileExtensions } from "@app/types";

export const INPUT_BAR_ACTIONS = [
  "attachment",
  "assistants-list",
  "assistants-list-with-actions",
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
  fileUploaderService: FileUploaderService;
  onNodeSelect?: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
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
  fileUploaderService,
  onNodeSelect,
  attachedNodes,
}: InputBarContainerProps) => {
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const [isExpanded, setIsExpanded] = useState(false);
  const [nodeCandidate, setNodeCandidate] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNode | null>(null);

  const handleUrlDetected = useCallback((nodeId: string | null) => {
    if (nodeId) {
      setNodeCandidate(nodeId);
    }
  }, []);

  // TODO: remove once attach from datasources is released
  const isAttachedFromDataSourceActivated = featureFlags.includes(
    "attach_from_datasources"
  );

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    resetEditorContainerSize,
    disableAutoFocus,
    ...(isAttachedFromDataSourceActivated && {
      onUrlDetected: handleUrlDetected,
    }),
  });

  useUrlHandler(editor, selectedNode);

  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const spacesMap = useMemo(
    () => Object.fromEntries(spaces?.map((space) => [space.sId, space]) || []),
    [spaces]
  );

  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    includeDataSources: true,
    owner,
    viewType: "all",
    nodeIds: nodeCandidate ? [nodeCandidate] : [],
    disabled:
      isSpacesLoading || !nodeCandidate || !isAttachedFromDataSourceActivated,
    spaceIds: spaces.map((s) => s.sId),
  });

  useEffect(() => {
    if (!nodeCandidate || !onNodeSelect || isSearchLoading) {
      return;
    }

    if (searchResultNodes.length > 0) {
      const nodesWithViews = searchResultNodes.flatMap((node) => {
        const { dataSourceViews, ...rest } = node;
        return dataSourceViews.map((view) => ({
          ...rest,
          dataSourceView: view,
          spacePriority: getSpaceAccessPriority(spacesMap[view.spaceId]),
        }));
      });

      if (nodesWithViews.length > 0) {
        const sortedNodes = nodesWithViews.sort(
          (a, b) => b.spacePriority - a.spacePriority
        );
        const node = sortedNodes[0];
        onNodeSelect(node);
        setSelectedNode(node);
      }

      // Reset node candidate after processing
      setNodeCandidate(null);
    } else {
      setNodeCandidate(null);
    }
  }, [
    searchResultNodes,
    nodeCandidate,
    onNodeSelect,
    isSearchLoading,
    editorService,
    spacesMap,
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

  function handleExpansionToggle() {
    setIsExpanded((currentExpanded) => !currentExpanded);
    // Focus at the end of the document when toggling expansion.
    editorService.focusEnd();
  }

  function resetEditorContainerSize() {
    setIsExpanded(false);
  }

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 px-2 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal",
    "pb-6 pt-4 sm:py-3.5" // Increased padding on mobile
  );

  return (
    <div
      id="InputBarContainer"
      className="relative flex flex-1 cursor-text flex-col sm:flex-row sm:pt-0"
    >
      <EditorContent
        editor={editor}
        className={classNames(
          contentEditableClasses,
          "scrollbar-hide",
          "overflow-y-auto",
          isExpanded
            ? "h-[60vh] max-h-[60vh] lg:h-[80vh] lg:max-h-[80vh]"
            : "max-h-64"
        )}
      />

      <div className="flex flex-row items-end justify-between gap-2 self-stretch pb-3 pr-3 sm:flex-col sm:border-0">
        <div className="flex items-center py-0 sm:py-3.5">
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
              {featureFlags.includes("attach_from_datasources") ? (
                <InputBarAttachmentsPicker
                  fileUploaderService={fileUploaderService}
                  owner={owner}
                  isLoading={false}
                  onNodeSelect={
                    onNodeSelect ||
                    ((node) => console.log(`Selected ${node.title}`))
                  }
                  attachedNodes={attachedNodes}
                />
              ) : (
                <Button
                  variant="ghost-secondary"
                  icon={AttachmentIcon}
                  size="xs"
                  tooltip={`Add a document to the conversation (${getSupportedFileExtensions().join(", ")}).`}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                />
              )}
            </>
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
              showFooterButtons={actions.includes(
                "assistants-list-with-actions"
              )}
            />
          )}
          {actions.includes("fullscreen") && (
            <div className="hidden sm:flex">
              <Button
                variant="ghost-secondary"
                icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                size="xs"
                onClick={handleExpansionToggle}
              />
            </div>
          )}
        </div>
        <Button
          size="sm"
          isLoading={disableSendButton}
          icon={ArrowUpIcon}
          variant="highlight"
          disabled={editorService.isEmpty() || disableSendButton}
          onClick={async () => {
            onEnterKeyDown(
              editorService.isEmpty(),
              editorService.getMarkdownAndMentions(),
              () => {
                editorService.clearEditor();
                resetEditorContainerSize();
              },
              editorService.setLoading
            );
          }}
        />
      </div>
    </div>
  );
};

export default InputBarContainer;
