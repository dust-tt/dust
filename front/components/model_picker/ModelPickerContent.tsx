import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import { ModelPickerModelsView } from "@app/components/model_picker/ModelPickerModelsView";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type {
  MakerGroup,
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
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
} from "@dust-tt/sparkle";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type PickerView = "root" | "models";

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
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  isMakersExpanded: boolean;
  onToggleMakers: () => void;
  activeMaker: ModelMakerIdType | null;
  onSelectMaker: (makerId: ModelMakerIdType) => void;
  onBack: () => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

export function ModelPickerContent({
  side,
  shouldBlockDismiss,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  makerGroups,
  streamModels,
  streams,
  isMakersExpanded,
  onToggleMakers,
  activeMaker,
  onSelectMaker,
  onBack,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerContentProps) {
  const activeMakerGroup = makerGroups.find(
    (maker) => maker.makerId === activeMaker
  );
  const targetView: PickerView = activeMakerGroup ? "models" : "root";

  // `displayedView` is what's actually on screen; it only catches up to
  // `targetView` once the outgoing view's exit animation has finished. This
  // is what lets the swap pair an exit with the entrance instead of hard-
  // cutting the outgoing view the instant the new one mounts.
  const [displayedView, setDisplayedView] = useState<PickerView>(targetView);
  const isExiting = displayedView !== targetView;

  // The root view's own slide-in would otherwise also play on the very
  // first paint, stacking on top of the dropdown's own open animation. Only
  // animate it on a genuine swap back to root, not on the initial mount.
  const isInitialRenderRef = useRef(true);
  useLayoutEffect(() => {
    isInitialRenderRef.current = false;
  }, []);

  const handleExitAnimationEnd = () => {
    setDisplayedView(targetView);
  };

  // `motion-reduce:animate-none` (applied below) removes the exit animation
  // entirely under prefers-reduced-motion, so `onAnimationEnd` would never
  // fire and the swap would get stuck showing the outgoing view forever.
  // Skip straight to the target view in that case.
  useEffect(() => {
    if (!isExiting) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedView(targetView);
    }
  }, [isExiting, targetView]);

  // While exiting, keep rendering the view that's leaving; once its exit
  // animation ends we jump straight to `targetView`, which then plays its
  // own enter animation on the next render.
  const viewToRender = isExiting ? displayedView : targetView;

  // Going back sets `activeMaker` to null on the same tick the exit starts,
  // so `activeMakerGroup` resolves to undefined immediately — but the
  // exiting models view still needs its maker group to render while it
  // slides out. Remember the last non-null one so the exit phase can still
  // render real content instead of falling back to the root view mid-exit.
  const lastMakerGroupRef = useRef(activeMakerGroup);
  if (activeMakerGroup) {
    lastMakerGroupRef.current = activeMakerGroup;
  }
  const activeMakerGroupToRender =
    viewToRender === "models"
      ? (activeMakerGroup ?? lastMakerGroupRef.current)
      : undefined;

  const exitClassName = isExiting
    ? `animate-out fill-mode-forwards duration-exit ease-enter motion-reduce:animate-none ${
        viewToRender === "models"
          ? "slide-out-to-right-4"
          : "slide-out-to-left-4"
      }`
    : "";

  const enterClassName =
    !isExiting && !(viewToRender === "root" && isInitialRenderRef.current)
      ? `animate-in duration-enter ease-enter motion-reduce:animate-none ${
          viewToRender === "models"
            ? "slide-in-from-right-4"
            : "slide-in-from-left-4"
        }`
      : "";

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
      <div
        key={isExiting ? `${viewToRender}-exit` : viewToRender}
        className={`max-h-[26rem] overflow-y-auto ${isExiting ? exitClassName : enterClassName}`}
        onAnimationEnd={isExiting ? handleExitAnimationEnd : undefined}
      >
        {viewToRender === "models" && activeMakerGroupToRender ? (
          // Picking a provider swaps the whole dropdown for its model list —
          // a real navigation, not an in-place reveal, so it slides in (and,
          // symmetrically, the root view slides out behind it).
          <ModelPickerModelsView
            makerId={activeMakerGroupToRender.makerId}
            models={activeMakerGroupToRender.models}
            shown={shown}
            agentDefault={agentDefault}
            canRevert={canRevert}
            lockPremiumEfforts={lockPremiumEfforts}
            onBack={onBack}
            onSelectModel={onSelectModel}
            onChangeEffort={onChangeEffort}
            onRevert={onRevert}
          />
        ) : (
          <>
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
                  visual={isMakersExpanded ? ChevronDown : ChevronRight}
                  size="xs"
                  className="text-muted-foreground"
                />
              }
              onClick={onToggleMakers}
              onSelect={(e) => e.preventDefault()}
            />

            {isMakersExpanded && (
              <ModelPickerMakersView
                makerGroups={makerGroups}
                shown={shown}
                onSelectMaker={onSelectMaker}
              />
            )}
          </>
        )}
      </div>
    </DropdownMenuContent>
  );
}
