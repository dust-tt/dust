import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarSpacesPicker } from "@app/components/assistant/conversation/input_bar/InputBarSpacesPicker";
import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Plus,
} from "@dust-tt/sparkle";
import { useState } from "react";

const PLUS_BUTTON_CLASSNAME = cn(
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
  INPUT_BAR_PILL_HOVER_CLASSNAME
);

interface InputBarPlusMenuProps {
  owner: WorkspaceType;
  user: UserType | null;
  buttonSize: "xs" | "sm";
  disabled: boolean;
  hideCapabilities: boolean;
  hideAttachments: boolean;
  selectedMCPServerViews: MCPServerViewLightType[];
  onMCPServerViewSelect: (serverView: MCPServerViewLightType) => void;
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
  fileUploaderService: FileUploaderService;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  attachedNodes: DataSourceViewContentNode[];
  conversation?: ConversationWithoutContentType;
  spaceId?: string;
  selectedSpaceIds: string[];
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  spaces?: SelectableConversationSpaceType[];
  isSpacesLoading?: boolean;
  canDeselectSelectedSpaces?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCapabilitiesPickerOpenChange?: (open: boolean) => void;
  onAttachmentsPickerOpenChange?: (open: boolean) => void;
}

export function InputBarPlusMenu({
  owner,
  user,
  buttonSize,
  disabled,
  hideCapabilities,
  hideAttachments,
  selectedMCPServerViews,
  onMCPServerViewSelect,
  onSkillSelect,
  fileUploaderService,
  onNodeSelect,
  onNodeUnselect,
  attachedNodes,
  conversation,
  spaceId,
  selectedSpaceIds,
  onSelectedSpaceIdsChange,
  spaces,
  isSpacesLoading,
  canDeselectSelectedSpaces,
  onOpenChange,
  onCapabilitiesPickerOpenChange,
  onAttachmentsPickerOpenChange,
}: InputBarPlusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const shouldPrefetch = isOpen || hasHovered;

  const hasAnyEntry = !hideCapabilities || !hideAttachments || spaces != null;
  if (!hasAnyEntry) {
    return null;
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChange?.(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={Plus}
          size={buttonSize}
          disabled={disabled}
          isRounded
          tooltip="More"
          className={PLUS_BUTTON_CLASSNAME}
          onMouseEnter={() => setHasHovered(true)}
          onFocus={() => setHasHovered(true)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {!hideCapabilities && (
          <CapabilitiesPicker
            type="subdropdown"
            owner={owner}
            user={user}
            selectedMCPServerViews={selectedMCPServerViews}
            onSelect={onMCPServerViewSelect}
            onSkillSelect={onSkillSelect}
            onOpenChange={onCapabilitiesPickerOpenChange}
            buttonSize={buttonSize}
            disabled={disabled}
          />
        )}
        {!hideAttachments && (
          <InputBarAttachmentsPicker
            type="subdropdown"
            owner={owner}
            fileUploaderService={fileUploaderService}
            isLoading={false}
            onNodeSelect={onNodeSelect}
            onNodeUnselect={onNodeUnselect}
            attachedNodes={attachedNodes}
            buttonSize={buttonSize}
            onOpenChange={onAttachmentsPickerOpenChange}
            toolFileUpload={{
              useCase: "conversation",
              useCaseMetadata: {
                conversationId: conversation?.sId,
              },
            }}
            spaceId={spaceId}
            disabled={disabled}
            prefetch={shouldPrefetch}
          />
        )}
        {spaces != null && (
          <InputBarSpacesPicker
            canDeselectSelectedSpaces={canDeselectSelectedSpaces ?? true}
            disabled={disabled}
            isLoading={!!isSpacesLoading}
            selectedSpaceIds={selectedSpaceIds}
            onSelectedSpaceIdsChange={onSelectedSpaceIdsChange}
            spaces={spaces}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
