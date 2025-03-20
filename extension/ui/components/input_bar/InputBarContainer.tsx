import { usePlatform } from "@app/shared/context/PlatformContext";
import { getSpaceAccessPriority } from "@app/shared/lib/spaces";
import { classNames } from "@app/shared/lib/utils";
import { AssistantPicker } from "@app/ui/components/assistants/AssistantPicker";
import { AttachFragment } from "@app/ui/components/conversation/AttachFragment";
import type { CustomEditorProps } from "@app/ui/components/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/ui/components/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/ui/components/input_bar/editor/useHandleMentions";
import { usePublicAssistantSuggestions } from "@app/ui/components/input_bar/editor/usePublicAssistantSuggestions";
import useUrlHandler from "@app/ui/components/input_bar/editor/useUrlHandler";
import { InputBarAttachmentsPicker } from "@app/ui/components/input_bar/InputBarAttachmentPicker";
import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import { useSpaces } from "@app/ui/hooks/useSpaces";
import { useSpacesSearch } from "@app/ui/hooks/useSpacesSearch";
import type {
  AgentMentionType,
  DataSourceViewContentNodeType,
  ExtensionWorkspaceType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { SplitButton } from "@dust-tt/sparkle";
import { EditorContent } from "@tiptap/react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: ExtensionWorkspaceType;
  selectedAssistant: AgentMentionType | null;
  stickyMentions?: AgentMentionType[];
  disableAutoFocus: boolean;
  isTabIncluded: boolean;
  setIncludeTab: (includeTab: boolean) => void;
  fileUploaderService: FileUploaderService;
  onNodeSelect?: (node: DataSourceViewContentNodeType) => void;
  attachedNodes: DataSourceViewContentNodeType[];
  isSubmitting: boolean;
}

export const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  owner,
  selectedAssistant,
  stickyMentions,
  disableAutoFocus,
  isTabIncluded,
  setIncludeTab,
  fileUploaderService,
  onNodeSelect,
  attachedNodes,
  isSubmitting,
}: InputBarContainerProps) => {
  const platform = usePlatform();
  const suggestions = usePublicAssistantSuggestions(agentConfigurations);

  const [nodeCandidate, setNodeCandidate] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNodeType | null>(null);

  const handleUrlDetected = useCallback((nodeId: string | null) => {
    if (nodeId) {
      setNodeCandidate(nodeId);
    }
  }, []);

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    disableAutoFocus,
    onUrlDetected: handleUrlDetected,
  });

  useUrlHandler(editor, selectedNode);

  const { spaces, isSpacesLoading } = useSpaces();
  const spacesMap = useMemo(
    () => Object.fromEntries(spaces?.map((space) => [space.sId, space]) || []),
    [spaces]
  );

  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    includeDataSources: true,
    viewType: "all",
    nodeIds: nodeCandidate ? [nodeCandidate] : [],
    disabled: isSpacesLoading || !nodeCandidate,
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

  const contentEditableClasses = classNames(
    "inline-block w-full pt-2",
    "border-0 pr-1 pl-2 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal"
  );

  const onClick = async () => {
    onEnterKeyDown(
      editorService.isEmpty(),
      editorService.getMarkdownAndMentions(),
      () => {
        editorService.clearEditor();
      },
      (loading) => {
        editorService.setLoading(loading);
      }
    );
  };

  const SendAction = {
    label: "Send",
    onClick,
    isLoading: isSubmitting,
  };
  const SendWithContentAction = {
    label: platform.getSendWithActionsLabel(),
    onClick,
    isLoading: isSubmitting,
  };

  return (
    <div id="InputBarContainer" className="relative flex flex-col w-full">
      <div className="flex space-x-2">
        <EditorContent
          editor={editor}
          className={classNames(
            contentEditableClasses,
            "scrollbar-hide",
            "overflow-y-auto",
            "min-h-32",
            "max-h-96",
            "flex-1"
          )}
        />
        <div className="flex items-start pt-1">
          <InputBarAttachmentsPicker
            fileUploaderService={fileUploaderService}
            owner={owner}
            isLoading={false}
            onNodeSelect={
              onNodeSelect || ((node) => console.log(`Selected ${node.title}`))
            }
            attachedNodes={attachedNodes}
          />
          <AssistantPicker
            owner={owner}
            size="xs"
            onItemClick={(c) => {
              editorService.insertMention({ id: c.sId, label: c.name });
            }}
            assistants={allAssistants}
            isLoading={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 mt-2">
        <AttachFragment
          owner={owner}
          fileUploaderService={fileUploaderService}
          isLoading={isSubmitting}
        />
        <SplitButton
          size="sm"
          actions={[SendAction, SendWithContentAction]}
          action={isTabIncluded ? SendWithContentAction : SendAction}
          variant="highlight"
          onActionChange={(action) => {
            setIncludeTab(action === SendWithContentAction);
          }}
          disabled={
            isSubmitting ||
            editorService.isEmpty() ||
            fileUploaderService.isProcessingFiles
          }
        />
      </div>
    </div>
  );
};
