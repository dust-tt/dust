import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import {
  getSpacesPickerLabel,
  InputBarSpacesPicker,
} from "@app/components/assistant/conversation/input_bar/InputBarSpacesPicker";
import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerType, MCPServerViewLightType } from "@app/lib/api/mcp";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Attachment01,
  Button,
  ChevronRight,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  Planet,
  Plus,
  ShapesPlus,
} from "@dust-tt/sparkle";
import type { Transition, Variants } from "framer-motion";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const PLUS_BUTTON_CLASSNAME = cn(
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
  INPUT_BAR_PILL_HOVER_CLASSNAME
);

const DRILL_IN_CHEVRON = (
  <Icon size="xs" visual={ChevronRight} className="text-primary-400" />
);

const PANEL_SWAP_OFFSET_PX = 8;
const PANEL_ENTER_TRANSITION: Transition = {
  duration: MOTION_DURATIONS.quickEnter,
  ease: MOTION_EASINGS.enter,
};
const PANEL_EXIT_TRANSITION: Transition = {
  duration: MOTION_DURATIONS.quickExit,
  ease: MOTION_EASINGS.enter,
};

const PAGE_VARIANTS: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    transform: `translateX(${direction * PANEL_SWAP_OFFSET_PX}px)`,
  }),
  idle: {
    opacity: 1,
    transform: "translateX(0px)",
    transition: PANEL_ENTER_TRANSITION,
  },
  exit: (direction: number) => ({
    opacity: 0,
    transform: `translateX(${-direction * PANEL_SWAP_OFFSET_PX}px)`,
    transition: PANEL_EXIT_TRANSITION,
  }),
};

type PlusMenuPage = "root" | "capabilities" | "attachments" | "spaces";

type PanelHeights = Partial<Record<PlusMenuPage, number>>;

interface PanelSizerProps {
  children: React.ReactNode;
  onHeightChange: (page: PlusMenuPage, height: number) => void;
  page: PlusMenuPage;
}

function PanelSizer({ children, onHeightChange, page }: PanelSizerProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) {
      return;
    }

    const measure = () => onHeightChange(page, node.offsetHeight);

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, [onHeightChange, page]);

  return <div ref={nodeRef}>{children}</div>;
}

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
  onSetupServer: (server: MCPServerType) => void;
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
  onSetupServer,
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
}: InputBarPlusMenuProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState<PlusMenuPage>("root");
  const [direction, setDirection] = useState(1);
  const [skillIdForDetails, setSkillIdForDetails] = useState<string | null>(
    null
  );
  const [serverViewForDetails, setServerViewForDetails] =
    useState<MCPServerViewLightType | null>(null);
  const [panelHeights, setPanelHeights] = useState<PanelHeights>({});

  const handleHeightChange = useCallback(
    (measuredPage: PlusMenuPage, measuredHeight: number) =>
      setPanelHeights((previous) =>
        previous[measuredPage] === measuredHeight
          ? previous
          : { ...previous, [measuredPage]: measuredHeight }
      ),
    []
  );

  const hasAnyEntry = !hideCapabilities || !hideAttachments || spaces != null;
  if (!hasAnyEntry) {
    return null;
  }

  const openPage = (nextPage: PlusMenuPage) => {
    setDirection(1);
    setPage(nextPage);
  };

  const goBack = () => {
    setDirection(-1);
    setPage("root");
  };

  const closeMenu = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
    if (open) {
      setDirection(1);
      setPage("root");
    }
  };

  const rootPage = (
    <div className="w-full p-1">
      {!hideCapabilities && (
        <DropdownMenuItem
          label="Capabilities"
          icon={
            <Icon
              size="xs"
              visual={ShapesPlus}
              className="text-muted-foreground"
            />
          }
          disabled={disabled}
          endComponent={DRILL_IN_CHEVRON}
          onSelect={(event) => {
            event.preventDefault();
            openPage("capabilities");
          }}
        />
      )}
      {!hideAttachments && (
        <DropdownMenuItem
          label="Attach knowledge"
          icon={
            <Icon
              size="xs"
              visual={Attachment01}
              className="text-muted-foreground"
            />
          }
          disabled={disabled}
          endComponent={DRILL_IN_CHEVRON}
          onSelect={(event) => {
            event.preventDefault();
            openPage("attachments");
          }}
        />
      )}
      {spaces != null && (
        <DropdownMenuItem
          label={getSpacesPickerLabel(selectedSpaceIds)}
          icon={
            <Icon size="xs" visual={Planet} className="text-muted-foreground" />
          }
          disabled={disabled}
          endComponent={DRILL_IN_CHEVRON}
          onSelect={(event) => {
            event.preventDefault();
            openPage("spaces");
          }}
        />
      )}
    </div>
  );

  const renderPage = () => {
    switch (page) {
      case "capabilities":
        return (
          <CapabilitiesPicker
            type="panel"
            owner={owner}
            user={user}
            selectedMCPServerViews={selectedMCPServerViews}
            onSelect={onMCPServerViewSelect}
            onSkillSelect={onSkillSelect}
            onSetupServer={onSetupServer}
            onBack={goBack}
            onClose={closeMenu}
            onShowSkillDetails={setSkillIdForDetails}
            onShowToolDetails={setServerViewForDetails}
            buttonSize={buttonSize}
            disabled={disabled}
          />
        );
      case "attachments":
        return (
          <InputBarAttachmentsPicker
            type="panel"
            owner={owner}
            fileUploaderService={fileUploaderService}
            isLoading={false}
            onNodeSelect={onNodeSelect}
            onNodeUnselect={onNodeUnselect}
            attachedNodes={attachedNodes}
            buttonSize={buttonSize}
            onBack={goBack}
            onClose={closeMenu}
            toolFileUpload={{
              useCase: "conversation",
              useCaseMetadata: {
                conversationId: conversation?.sId,
              },
            }}
            spaceId={spaceId}
            disabled={disabled}
          />
        );
      case "spaces":
        return (
          <InputBarSpacesPicker
            canDeselectSelectedSpaces={canDeselectSelectedSpaces ?? true}
            isLoading={!!isSpacesLoading}
            onBack={goBack}
            selectedSpaceIds={selectedSpaceIds}
            onSelectedSpaceIdsChange={onSelectedSpaceIdsChange}
            spaces={spaces ?? []}
          />
        );
      case "root":
        return rootPage;
      default:
        assertNeverAndIgnore(page);
        return null;
    }
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost-secondary"
            icon={Plus}
            size={buttonSize}
            disabled={disabled}
            isRounded
            tooltip="More"
            className={PLUS_BUTTON_CLASSNAME}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={8}
          className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        >
          <div
            className="relative w-full overflow-hidden transition-[height] duration-quick-enter ease-enter motion-reduce:transition-none"
            style={
              panelHeights[page] === undefined
                ? undefined
                : { height: panelHeights[page] }
            }
          >
            <LazyMotion features={domAnimation}>
              <AnimatePresence
                initial={false}
                mode="popLayout"
                custom={direction}
              >
                <m.div
                  key={page}
                  className="w-full"
                  custom={direction}
                  variants={shouldReduceMotion ? undefined : PAGE_VARIANTS}
                  initial="enter"
                  animate="idle"
                  exit="exit"
                >
                  <PanelSizer page={page} onHeightChange={handleHeightChange}>
                    {renderPage()}
                  </PanelSizer>
                </m.div>
              </AnimatePresence>
            </LazyMotion>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <CapabilityDetailsSheets
        owner={owner}
        user={user}
        selectedSkillId={skillIdForDetails}
        selectedMCPServerView={serverViewForDetails}
        onCloseSkill={() => setSkillIdForDetails(null)}
        onCloseTool={() => setServerViewForDetails(null)}
      />
    </>
  );
}
