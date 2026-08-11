import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import { InputBarSpacesPicker } from "@app/components/assistant/conversation/input_bar/InputBarSpacesPicker";
import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Attachment01,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Planet,
  Plus,
  ShapesPlus,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

const PLUS_BUTTON_CLASSNAME = cn(
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
  INPUT_BAR_PILL_HOVER_CLASSNAME
);

// Which picker the mobile layout has drilled into. Mobile cannot use sub-menus:
// a sub-menu is positioned beside its parent menu, and `parent width +
// sub-menu width` exceeds a phone viewport, so Radix flips it to the other side
// where it does not fit either — leaving it mostly off-screen. Instead the "+"
// menu closes and the picker reopens as a top-level dropdown anchored to the
// "+" button, which Radix keeps inside the viewport.
const MOBILE_PICKERS = ["capabilities", "attachments", "spaces"] as const;
type MobilePicker = (typeof MOBILE_PICKERS)[number];

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
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const [openMobilePicker, setOpenMobilePicker] = useState<MobilePicker | null>(
    null
  );
  const plusButtonRef = useRef<HTMLDivElement>(null);
  const shouldPrefetch = isOpen || hasHovered || openMobilePicker !== null;

  const hasAnyEntry = !hideCapabilities || !hideAttachments || spaces != null;
  if (!hasAnyEntry) {
    return null;
  }

  const openPicker = (picker: MobilePicker) => {
    setIsOpen(false);
    onOpenChange?.(false);
    setOpenMobilePicker(picker);
  };

  const closeMobilePicker = (picker: MobilePicker, open: boolean) => {
    setOpenMobilePicker(open ? picker : null);
  };

  const spacesLabel =
    selectedSpaceIds.length > 0
      ? `${selectedSpaceIds.length} additional Space${selectedSpaceIds.length > 1 ? "s" : ""}`
      : "Spaces";

  const capabilitiesPicker = (
    <CapabilitiesPicker
      type={isMobile ? "dropdown" : "subdropdown"}
      owner={owner}
      user={user}
      selectedMCPServerViews={selectedMCPServerViews}
      onSelect={onMCPServerViewSelect}
      onSkillSelect={onSkillSelect}
      onOpenChange={onCapabilitiesPickerOpenChange}
      buttonSize={buttonSize}
      disabled={disabled}
      {...(isMobile
        ? {
            externalOpen: openMobilePicker === "capabilities",
            onExternalOpenChange: (open: boolean) =>
              closeMobilePicker("capabilities", open),
            anchorRef: plusButtonRef,
          }
        : {})}
    />
  );

  const attachmentsPicker = (
    <InputBarAttachmentsPicker
      type={isMobile ? "dropdown" : "subdropdown"}
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
      {...(isMobile
        ? {
            externalOpen: openMobilePicker === "attachments",
            onExternalOpenChange: (open: boolean) =>
              closeMobilePicker("attachments", open),
            anchorRef: plusButtonRef,
          }
        : {})}
    />
  );

  const spacesPicker = (
    <InputBarSpacesPicker
      type={isMobile ? "dropdown" : "subdropdown"}
      canDeselectSelectedSpaces={canDeselectSelectedSpaces ?? true}
      disabled={disabled}
      isLoading={!!isSpacesLoading}
      selectedSpaceIds={selectedSpaceIds}
      onSelectedSpaceIdsChange={onSelectedSpaceIdsChange}
      spaces={spaces ?? []}
      {...(isMobile
        ? {
            externalOpen: openMobilePicker === "spaces",
            onExternalOpenChange: (open: boolean) =>
              closeMobilePicker("spaces", open),
            anchorRef: plusButtonRef,
          }
        : {})}
    />
  );

  return (
    <>
      {/* The wrapper is the anchor the mobile pickers position against; it
          hugs the "+" button because the menu itself renders in a portal. */}
      <div ref={plusButtonRef} className="flex items-center">
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
            {isMobile ? (
              <>
                {!hideCapabilities && (
                  <DropdownMenuItem
                    label="Capabilities"
                    icon={ShapesPlus}
                    disabled={disabled}
                    onClick={() => openPicker("capabilities")}
                  />
                )}
                {!hideAttachments && (
                  <DropdownMenuItem
                    label="Attach knowledge"
                    icon={Attachment01}
                    disabled={disabled}
                    onClick={() => openPicker("attachments")}
                  />
                )}
                {spaces != null && (
                  <DropdownMenuItem
                    label={spacesLabel}
                    icon={Planet}
                    disabled={disabled}
                    onClick={() => openPicker("spaces")}
                  />
                )}
              </>
            ) : (
              <>
                {!hideCapabilities && capabilitiesPicker}
                {!hideAttachments && attachmentsPicker}
                {spaces != null && spacesPicker}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* On mobile the pickers live outside the "+" menu so they can be
          positioned against the "+" button as top-level dropdowns. */}
      {isMobile && (
        <>
          {!hideCapabilities && capabilitiesPicker}
          {!hideAttachments && attachmentsPicker}
          {spaces != null && spacesPicker}
        </>
      )}
    </>
  );
}
