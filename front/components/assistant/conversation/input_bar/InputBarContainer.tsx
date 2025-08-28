import { ArrowUpIcon, Button, TelescopeIcon } from "@dust-tt/sparkle";
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
import { ToolsPicker } from "@app/components/assistant/ToolsPicker";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isNodeCandidate } from "@app/lib/connectors";
import { getSpaceAccessPriority } from "@app/lib/spaces";
import { useSpaces, useSpacesSearch } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";
import { getSupportedFileExtensions } from "@app/types";

export const INPUT_BAR_ACTIONS = [
  "tools",
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
  disableTextInput: boolean;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onMCPServerViewDeselect: (serverView: MCPServerViewType) => void;
  selectedMCPServerViewIds: string[];
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
  selectedMCPServerViewIds,
}: InputBarContainerProps) => {
  // Deep research toggle UI has no animation; keep state minimal
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const [nodeOrUrlCandidate, setNodeOrUrlCandidate] = useState<
    UrlCandidate | NodeCandidate | null
  >(null);

  const [selectedNode, setSelectedNode] =
    useState<DataSourceViewContentNode | null>(null);

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

  // Pass the editor ref to the mention dropdown hook
  const mentionDropdown = useMentionDropdown(suggestions, editorRef);

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    disableAutoFocus,
    onUrlDetected: handleUrlDetected,
    suggestionHandler: mentionDropdown.getSuggestionHandler(),
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

  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
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

  // Track current mentions for Deep Research toggle
  const [currentMentions, setCurrentMentions] = useState<string[]>([]);
  
  useEffect(() => {
    if (!editor) return;
    
    // Update mentions whenever editor content changes
    const updateMentions = () => {
      const { mentions } = editorService.getMarkdownAndMentions();
      setCurrentMentions(mentions.map(m => m.id));
    };
    
    editor.on('update', updateMentions);
    updateMentions(); // Initial update
    
    return () => {
      editor.off('update', updateMentions);
    };
  }, [editor, editorService]);
  
  const hasDustMention = currentMentions.includes("dust");
  const hasDustDeepMention = currentMentions.includes("dust-deep");
  
  // Check if dust and dust-deep agents are available
  const dustAgent = useMemo(() => {
    return agentConfigurations.find((agent) => agent.sId === "dust");
  }, [agentConfigurations]);
  
  const dustDeepAgent = useMemo(() => {
    return agentConfigurations.find((agent) => agent.sId === "dust-deep");
  }, [agentConfigurations]);
  
  // Show button if either dust or dust-deep is mentioned and both agents are available
  const showDeepResearchToggle =
    (hasDustMention || hasDustDeepMention) && dustAgent && dustDeepAgent;
  // Consider deep mode active if any dust-deep pill is present
  const isInDeepMode = hasDustDeepMention;
  

  const handleDeepResearchToggle = useCallback(() => {
    if (!editor || !dustDeepAgent || !dustAgent) return;


    const { mentions } = editorService.getMarkdownAndMentions();

    // Get current editor content as JSON
    const json = editor.getJSON();

    // Determine direction based on latest editor state (not cached state)
    const hasDustNow = mentions.some((m) => m.id === "dust");
    const fromId = hasDustNow ? "dust" : "dust-deep";
    const toAgent = hasDustNow ? dustDeepAgent : dustAgent;
    
    // Function to recursively replace mentions
    const replaceMentions = (node: any): any => {
      if (node.type === 'mention' && node.attrs?.id === fromId) {
        return {
          ...node,
          attrs: {
            ...node.attrs,
            id: toAgent.sId,
            label: toAgent.name
          }
        };
      }
      
      if (node.content) {
        return {
          ...node,
          content: node.content.map(replaceMentions)
        };
      }
      
      return node;
    };
    
    const updatedJson = replaceMentions(json);
    
    // Set the updated content
    // Emit update so mention listeners refresh and button background syncs
    editor.commands.setContent(updatedJson, true);
    editor.commands.focus('end');
  }, [dustAgent, dustDeepAgent, editor, editorService]);

  // No optimistic state; background derives solely from current content

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
        <div className="flex items-center justify-between px-1 px-2 py-1.5 sm:pb-3 sm:pr-3">
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
                selectedMCPServerViewIds={selectedMCPServerViewIds}
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

            {showDeepResearchToggle && (
              <Button
                size="xs"
                icon={TelescopeIcon}
                variant="ghost-secondary"
                onClick={() => {
                  handleDeepResearchToggle();
                }}
                className={classNames(
                  "ml-1 s-!transition-none",
                  isInDeepMode &&
                    [
                      "s-bg-blue-100 s-text-blue-900",
                      "hover:s-bg-blue-100 active:s-bg-blue-100",
                      "dark:s-bg-blue-100-night dark:s-text-blue-900-night",
                      "dark:hover:s-bg-blue-100-night dark:active:s-bg-blue-100-night",
                    ].join(" ")
                )}
                aria-pressed={isInDeepMode}
                aria-label={
                  isInDeepMode
                    ? "Switch to regular Dust mode"
                    : "Switch to Deep Research mode"
                }
                disabled={disableTextInput}
                title={
                  isInDeepMode
                    ? "Switch to regular Dust mode"
                    : "Switch to Deep Research mode"
                }
              />
            )}
          </div>
          <Button
            size="xs"
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
                },
                editorService.setLoading
              );
            }}
          />
        </div>
      </div>
      
      <MentionDropdown mentionDropdownState={mentionDropdown} />
    </div>
  );
};

export default InputBarContainer;
