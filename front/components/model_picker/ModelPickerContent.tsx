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
} from "@dust-tt/sparkle";
import type { Variants } from "framer-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers,
  // so the menu stays reachable after a pick.
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

// Slide direction for the drill-down transition, root < makers < models.
const VIEW_ORDER: ModelPickerView[] = ["root", "makers", "models"];

// A step further in (root -> makers -> models) slides the incoming view in
// from the right and pushes the outgoing one left; going back reverses it.
const slideVariants: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -24 : 24, opacity: 0 }),
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

  // Derive the slide direction from the previous view: a plain ref survives
  // across renders without triggering one, since it's only read during the
  // transition that the `view` change itself already causes.
  const previousViewRef = useRef<ModelPickerView>(view);
  const direction =
    VIEW_ORDER.indexOf(view) >= VIEW_ORDER.indexOf(previousViewRef.current)
      ? 1
      : -1;
  previousViewRef.current = view;

  const activeMakerGroup = makerGroups.find(
    (maker) => maker.makerId === activeMaker
  );

  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width) overflow-hidden"
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
      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          {view === "root" && (
            <motion.div
              key="root"
              custom={direction}
              variants={prefersReducedMotion ? undefined : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
              <DropdownMenuLabel label="Recommendations" className="text-sm" />

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
            </motion.div>
          )}

          {view === "makers" && (
            <motion.div
              key="makers"
              custom={direction}
              variants={prefersReducedMotion ? undefined : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
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
            </motion.div>
          )}

          {view === "models" && activeMakerGroup && (
            <motion.div
              key="models"
              custom={direction}
              variants={prefersReducedMotion ? undefined : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DropdownMenuContent>
  );
}
