import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import { ModelPickerModelsView } from "@app/components/model_picker/ModelPickerModelsView";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type {
  MakerGroup,
  ModelPickerView,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getModelLockTooltip,
  getTierLockReason,
  getTierResolvedModelLabel,
  isTierDisplayed,
  MODEL_TIERS,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
  MOTION_DURATIONS,
  MOTION_EASINGS,
} from "@dust-tt/sparkle";
import type { Variants } from "framer-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers
  // on the open submenus, so they stay reachable after a pick.
  shouldBlockDismiss: () => boolean;
  shown: Selection;
  agentDefault: Selection;
  canRevert: boolean;
  lockPremiumEfforts: boolean;
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  search: string;
  onSearchChange: (value: string) => void;
  view: ModelPickerView;
  activeMaker: ModelMakerIdType | null;
  onOpenMakers: () => void;
  onSelectMaker: (makerId: ModelMakerIdType) => void;
  onBack: () => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

const VIEW_ORDER: ModelPickerView[] = ["root", "makers", "models"];

const STEP_ENTER_TRANSITION = {
  duration: MOTION_DURATIONS.enter,
  ease: MOTION_EASINGS.enter,
} as const;
const STEP_EXIT_TRANSITION = {
  duration: MOTION_DURATIONS.exit,
  ease: MOTION_EASINGS.enter,
} as const;

const stepVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    transform: `translateX(${direction > 0 ? 12 : -12}px)`,
  }),
  center: {
    opacity: 1,
    transform: "translateX(0px)",
    transition: STEP_ENTER_TRANSITION,
  },
  exit: (direction: number) => ({
    opacity: 0,
    transform: `translateX(${direction > 0 ? -12 : 12}px)`,
    transition: STEP_EXIT_TRANSITION,
  }),
};

export function ModelPickerContent({
  side,
  shouldBlockDismiss,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  makerGroups,
  allModels,
  streamModels,
  streams,
  search,
  onSearchChange,
  view,
  activeMaker,
  onOpenMakers,
  onSelectMaker,
  onBack,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerContentProps) {
  const prefersReducedMotion = useReducedMotion();

  const previousViewRef = useRef<ModelPickerView>(view);
  const direction =
    VIEW_ORDER.indexOf(view) >= VIEW_ORDER.indexOf(previousViewRef.current)
      ? 1
      : -1;
  previousViewRef.current = view;

  const activeMakerGroup = makerGroups.find(
    (maker) => maker.makerId === activeMaker
  );

  const stepBodyClassName = "max-h-[26rem] overflow-y-auto";

  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="start"
      side={side}
      onFocusOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onPointerDownOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onInteractOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
    >
      <motion.div layout={!prefersReducedMotion} className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {view === "root" && (
            <motion.div
              key="root"
              custom={direction}
              variants={prefersReducedMotion ? undefined : stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className={stepBodyClassName}>
                <DropdownMenuLabel
                  label="Recommendations"
                  className="text-sm"
                />

                {MODEL_TIERS.map((tier) => {
                  const isSelected = isTierDisplayed(tier.id, shown.display);
                  const lockReason = getTierLockReason(tier.id, {
                    lockPremiumEfforts,
                    streamModels,
                  });
                  if (lockReason) {
                    return (
                      <DropdownMenuItem
                        key={tier.id}
                        icon={MODEL_TIER_ICON[tier.id]}
                        label={tier.name}
                        disabled
                        tooltip={getModelLockTooltip(lockReason)}
                        endComponent={
                          <Icon
                            visual={Lock01}
                            size="sm"
                            className="text-muted-foreground"
                          />
                        }
                        onSelect={(e) => e.preventDefault()}
                      />
                    );
                  }
                  return (
                    <DropdownMenuItem
                      key={tier.id}
                      icon={MODEL_TIER_ICON[tier.id]}
                      label={tier.name}
                      className="text-foreground"
                      endComponent={
                        <div className="flex items-center gap-3">
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {getTierResolvedModelLabel(tier.id, streams)}
                          </span>
                          {isSelected && (
                            <ModelPickerSelectionIndicator
                              canRevert={canRevert}
                              onRevert={onRevert}
                              size="xs"
                            />
                          )}
                        </div>
                      }
                      onClick={() => onSelectTier(tier.id)}
                      onSelect={(e) => e.preventDefault()}
                    />
                  );
                })}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  label="More models"
                  endComponent={
                    <Icon
                      visual={ChevronRight}
                      size="xs"
                      className="text-muted-foreground"
                    />
                  }
                  onClick={onOpenMakers}
                  onSelect={(e) => e.preventDefault()}
                />
              </div>
            </motion.div>
          )}

          {view === "makers" && (
            <motion.div
              key="makers"
              custom={direction}
              variants={prefersReducedMotion ? undefined : stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className={stepBodyClassName}>
                <ModelPickerMakersView
                  makerGroups={makerGroups}
                  allModels={allModels}
                  shown={shown}
                  agentDefault={agentDefault}
                  canRevert={canRevert}
                  lockPremiumEfforts={lockPremiumEfforts}
                  search={search}
                  onSearchChange={onSearchChange}
                  onBack={onBack}
                  onSelectMaker={onSelectMaker}
                  onSelectModel={onSelectModel}
                  onChangeEffort={onChangeEffort}
                  onRevert={onRevert}
                />
              </div>
            </motion.div>
          )}

          {view === "models" && activeMakerGroup && (
            <motion.div
              key="models"
              custom={direction}
              variants={prefersReducedMotion ? undefined : stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className={stepBodyClassName}>
                <ModelPickerModelsView
                  makerId={activeMakerGroup.makerId}
                  models={activeMakerGroup.models}
                  shown={shown}
                  agentDefault={agentDefault}
                  canRevert={canRevert}
                  lockPremiumEfforts={lockPremiumEfforts}
                  onBack={onBack}
                  onSelectModel={onSelectModel}
                  onChangeEffort={onChangeEffort}
                  onRevert={onRevert}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </DropdownMenuContent>
  );
}
