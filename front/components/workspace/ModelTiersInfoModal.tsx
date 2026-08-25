import type { ModelTierExplainerTier } from "@app/lib/client/model_tiers_explainer";
import { getModelTierExplainer } from "@app/lib/client/model_tiers_explainer";
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
} from "@dust-tt/sparkle";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";

const TIER_PRESENTATION: Record<ModelsTierName, { priceClassName: string }> = {
  cost_efficient: { priceClassName: "text-emerald-500" },
  balanced: { priceClassName: "text-blue-500" },
  premium: { priceClassName: "text-amber-500" },
};

interface TierCardProps {
  tier: ModelTierExplainerTier;
}

function TierCard({ tier }: TierCardProps) {
  const { priceClassName } = TIER_PRESENTATION[tier.name];

  return (
    <Collapsible>
      <div className="rounded-2xl border border-border bg-muted-background dark:border-border-dark dark:bg-muted-background-night">
        <CollapsibleTrigger
          hideChevron
          className="w-full rounded-2xl p-4 text-left"
        >
          <div className="flex w-full items-center gap-3">
            <span
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
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                Model
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                Reasoning effort
              </span>
            </div>
            {tier.models.map((model) => (
              <div
                key={model.displayName}
                className="flex items-center justify-between gap-3 border-t border-border py-3 dark:border-border-dark"
              >
                <span className="text-sm text-foreground dark:text-foreground-night">
                  {model.displayName}
                </span>
                <Chip size="xs" color="primary" label={model.effortsLabel} />
              </div>
            ))}
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
  const tiers = useMemo(() => getModelTierExplainer(), []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>How model tiers work</DialogTitle>
        </DialogHeader>
        {/* Content-sized scroll region: min-h-0 lets it shrink below its content
            so it scrolls once it hits the dialog's max-height, while staying
            compact (no empty space) when the tiers are collapsed. */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Each tier groups <b>model + reasoning-effort</b> options based on
            cost. A member capped at a tier can use that tier and every cheaper
            one — “Up to Standard” means Standard and Basic. Open a tier to see
            what's inside.
          </p>
          <div className="flex flex-col gap-2">
            {tiers.map((tier) => (
              <TierCard key={tier.name} tier={tier} />
            ))}
          </div>
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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        icon={InformationCircleIcon}
        tooltip="How model tiers work"
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
