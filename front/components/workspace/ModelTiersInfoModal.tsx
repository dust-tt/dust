import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { ModelTierExplainerTier } from "@app/lib/client/model_tiers_explainer";
import { getModelTierExplainer } from "@app/lib/client/model_tiers_explainer";
import { useModels } from "@app/lib/swr/models";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Icon,
  InfoCircle,
  Spinner,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const TIER_PRESENTATION: Record<
  ModelsTierName,
  { priceClassName: string; costLabel: MessageDescriptor }
> = {
  cost_efficient: {
    priceClassName: "text-emerald-500",
    costLabel: msg`lowest cost`,
  },
  balanced: { priceClassName: "text-blue-500", costLabel: msg`medium cost` },
  premium: { priceClassName: "text-amber-500", costLabel: msg`high cost` },
  ultra: { priceClassName: "text-rose-500", costLabel: msg`highest cost` },
};

interface InfoSectionProps {
  title: string;
  children: ReactNode;
}

function InfoSection({ title, children }: InfoSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="heading-sm text-foreground dark:text-foreground-night">
        {title}
      </h3>
      <p>{children}</p>
    </div>
  );
}

interface TierCardProps {
  tier: ModelTierExplainerTier;
}

function TierCard({ tier }: TierCardProps) {
  const { t } = useLingui();
  const { priceClassName } = TIER_PRESENTATION[tier.name];
  const costLabel = t(TIER_PRESENTATION[tier.name].costLabel);
  const tierName = tier.displayName;

  return (
    <Collapsible>
      <div className="rounded-2xl border border-border bg-muted-background dark:border-border-dark dark:bg-muted-background-night">
        <CollapsibleTrigger
          hideChevron
          aria-label={t`Open ${tierName} tier (${costLabel})`}
          className="w-full rounded-2xl p-4 text-left"
        >
          <div className="flex w-full items-center gap-3">
            <span
              aria-hidden="true"
              className={`w-8 shrink-0 text-sm font-semibold ${priceClassName}`}
            >
              {"$".repeat(tier.priceLevel)}
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="heading-sm text-foreground dark:text-foreground-night">
                {tier.displayName}
              </span>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {tier.description}
              </span>
            </div>
            <Icon
              visual={ChevronRight}
              size="sm"
              className="shrink-0 text-muted-foreground group-data-[state=open]/col:hidden dark:text-muted-foreground-night"
            />
            <Icon
              visual={ChevronDown}
              size="sm"
              className="hidden shrink-0 text-muted-foreground group-data-[state=open]/col:block dark:text-muted-foreground-night"
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col px-4 pb-2">
            <div className="flex items-center justify-between gap-3 border-t border-border py-2 dark:border-border-dark">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                <Trans>Model</Trans>
              </span>
              <span className="text-xs font-semibold tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                <Trans>Reasoning effort</Trans>
              </span>
            </div>
            {tier.models.length === 0 ? (
              <div className="border-t border-border py-3 text-sm text-muted-foreground dark:border-border-dark dark:text-muted-foreground-night">
                <Trans>
                  No model in this tier is available in this workspace.
                </Trans>
              </div>
            ) : (
              tier.models.map((model) => (
                <div
                  key={model.displayName}
                  className="flex items-center justify-between gap-3 border-t border-border py-3 dark:border-border-dark"
                >
                  <span className="text-sm text-foreground dark:text-foreground-night">
                    {model.displayName}
                  </span>
                  <Chip size="xs" color="primary" label={model.effortsLabel} />
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface ModelTiersInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function ModelTiersInfoDialog({ isOpen, onClose }: ModelTiersInfoDialogProps) {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { models, isModelsLoading } = useModels({ owner, disabled: !isOpen });
  const tiers = useMemo(
    () => getModelTierExplainer(new Set(models.map((model) => model.modelId))),
    [models]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>How model tiers work</Trans>
          </DialogTitle>
        </DialogHeader>
        {/* Content-sized scroll region: min-h-0 lets it shrink below its content
            so it scrolls once it hits the dialog's max-height, while staying
            compact (no empty space) when the tiers are collapsed. */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
            <p>
              <Trans>
                Model tiers group models and reasoning efforts by typical usage
                cost. Higher tiers include more capable, more expensive
                combinations.
              </Trans>
            </p>
            <InfoSection title={t`What each tier includes`}>
              <Trans>
                Each tier includes a range of models and reasoning efforts with
                similar usage costs. Reasoning effort is how much work a model
                does before it answers: a higher effort can give better results
                on complex tasks, but usually costs more.
              </Trans>
            </InfoSection>
            <InfoSection title={t`Why costs differ`}>
              <Trans>
                Usage cost depends on both the model and its reasoning effort.
                We compare each combination on representative tasks rather than
                on the model's token price alone. Raising the reasoning effort
                by one step usually increases the cost by about 30%.
              </Trans>
            </InfoSection>
            <InfoSection title={t`How access limits work`}>
              <Trans>
                A member can use the tier they are assigned and every lower-cost
                tier: access to Standard also includes Basic.
              </Trans>
            </InfoSection>
            <InfoSection title={t`See what's included`}>
              <Trans>
                Select a tier to see the models and reasoning efforts it
                includes.
              </Trans>
            </InfoSection>
          </div>
          {isModelsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tiers.map((tier) => (
                <TierCard key={tier.name} tier={tier} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ModelTiersInfoButtonProps {
  className?: string;
}

// Info (ⓘ) affordance that opens the "How model tiers work" modal. Drop it next
// to any "Models tier" label (column headers, settings pickers).
export function ModelTiersInfoButton({ className }: ModelTiersInfoButtonProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        icon={InfoCircle}
        tooltip={t`How model tiers work`}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
      />
      <ModelTiersInfoDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
