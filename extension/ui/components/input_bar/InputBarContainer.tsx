import { usePlatform } from "@app/shared/context/PlatformContext";
import type { NodeCandidate, UrlCandidate } from "@app/shared/lib/connectors";
import { isNodeCandidate } from "@app/shared/lib/connectors";
import { getSpaceAccessPriority } from "@app/shared/lib/spaces";
import { classNames } from "@app/shared/lib/utils";
import { AssistantPicker } from "@app/ui/components/assistants/AssistantPicker";
import { AttachFragment } from "@app/ui/components/conversation/AttachFragment";
import { MentionDropdown } from "@app/ui/components/input_bar/editor/MentionDropdown";
import type { CustomEditorProps } from "@app/ui/components/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/ui/components/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/ui/components/input_bar/editor/useHandleMentions";
import { useMentionDropdown } from "@app/ui/components/input_bar/editor/useMentionDropdown";
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
import { SplitButton, useSendNotification } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRef } from "react";

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
  onNodeSelect: (node: DataSourceViewContentNodeType) => void;
  onNodeUnselect: (node: DataSourceViewContentNodeType) => void;
  attachedNodes: DataSourceViewContentNodeType[];
  isSubmitting: boolean;
  attachmentPickerSide?: "top" | "right" | "bottom" | "left";
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
  onNodeUnselect,
  attachedNodes,
  isSubmitting,
  attachmentPickerSide = "bottom",
}: InputBarContainerProps) => {
  const platform = usePlatform();
  const suggestions = usePublicAssistantSuggestions(agentConfigurations);
  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);
  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNodeType | null>(null);

  // Create a ref to hold the editor instance
  const editorRef = useRef<Editor | null>(null);

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

  const mentionDropdown = useMentionDropdown(suggestions, editorRef);

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    disableAutoFocus,
    onUrlDetected: handleUrlDetected,
    suggestionHandler: mentionDropdown.getSuggestionHandler(),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const sendNotification = useSendNotification();

  useUrlHandler(editor, selectedNode, nodeOrUrlCandidate, handleUrlReplaced);

  const { spaces, isSpacesLoading } = useSpaces();
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
          viewType: "all",
          disabled: isSpacesLoading || !nodeOrUrlCandidate,
          spaceIds: spaces.map((s) => s.sId),
        }
      : {
          // TextSearchParams
          search: nodeOrUrlCandidate?.url || "",
          searchSourceUrls: true,
          includeDataSources: false,
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
            onNodeSelect={onNodeSelect}
            onNodeUnselect={onNodeUnselect}
            attachedNodes={attachedNodes}
            side={attachmentPickerSide}
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
            fileUploaderService.isProcessingFiles ||
            fileUploaderService.isCapturing
          }
        />
      </div>

      <MentionDropdown mentionDropdownState={mentionDropdown} />
    </div>
  );
};
