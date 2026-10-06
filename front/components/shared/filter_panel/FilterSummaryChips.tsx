import type { FilterSummary } from "@app/components/shared/filter_panel/filterState";
import { Button, Chip, cn, LoadingBlock, Plus } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import type { ReactNode } from "react";

function SummaryLabel({
  categoryLabel,
  options,
}: Pick<FilterSummary<string>, "categoryLabel" | "options">) {
  const optionNames = options.reduce<ReactNode>((previousNames, option) => {
    const optionName = <span className="font-bold">{option.name}</span>;
    return previousNames === null ? (
      optionName
    ) : (
      <Trans>
        {previousNames} or {optionName}
      </Trans>
    );
  }, null);

  return (
    <span className="min-w-0 truncate text-xs font-medium">
      <Trans>
        <span className="font-bold">{categoryLabel}</span> is {optionNames}
      </Trans>
    </span>
  );
}

// Shared by a category's active chip and its preset, so React keeps one element across the switch.
function getCategoryChipKey(category: string) {
  return `category:${category}`;
}

interface FilterExtraChip {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

interface FilterSummaryChipsProps<
  Category extends string,
  Preset extends FilterSummary<Category>,
> {
  summaries: FilterSummary<Category>[];
  // Chips for settings outside the filter categories, shown after the category chips.
  extraChips?: FilterExtraChip[];
  // Faded filters, labelled as the chip they become, applied on click. Shown after the active
  // chips. A preset shares its category's chip key, so applying it morphs it into the active chip.
  presets?: Preset[];
  onApplyPreset?: (preset: Preset) => void;
  onClearCategory: (category: Category) => void;
  onClearAll: () => void;
  isLoading?: boolean;
  className?: string;
}

export function FilterSummaryChips<
  Category extends string,
  Preset extends FilterSummary<Category>,
>({
  summaries,
  extraChips = [],
  presets = [],
  onApplyPreset,
  onClearCategory,
  onClearAll,
  isLoading = false,
  className,
}: FilterSummaryChipsProps<Category, Preset>) {
  const { t } = useLingui();
  const chips: FilterExtraChip[] = [
    ...summaries.map((summary) => ({
      key: getCategoryChipKey(summary.category),
      label: (
        <SummaryLabel
          categoryLabel={summary.categoryLabel}
          options={summary.options}
        />
      ),
      onRemove: () => onClearCategory(summary.category),
    })),
    ...extraChips.map((chip) => ({ ...chip, key: `extra:${chip.key}` })),
  ];
  const chipsAndPresets = [
    ...chips.map((chip) => ({ ...chip, onApply: undefined })),
    ...presets.map((preset) => ({
      key: getCategoryChipKey(preset.category),
      label: (
        <SummaryLabel
          categoryLabel={preset.categoryLabel}
          options={preset.options}
        />
      ),
      onRemove: undefined,
      onApply: () => onApplyPreset?.(preset),
    })),
  ];
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence initial={false}>
        {chipsAndPresets.length > 0 && (
          <m.div
            key="filter-summary-chips"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={transition}
            className={className}
          >
            <div
              aria-busy={isLoading}
              className="flex flex-wrap items-center gap-2"
            >
              <AnimatePresence initial={false}>
                {chipsAndPresets.map((chip) => (
                  <m.div
                    key={chip.key}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={
                      shouldReduceMotion ? undefined : { opacity: 0, x: -4 }
                    }
                    transition={transition}
                    className="max-w-full"
                  >
                    <Chip
                      size="xs"
                      color={chip.onApply ? "primary" : "highlight"}
                      className={cn(
                        "max-w-full outline-1 -outline-offset-1 outline-dashed",
                        "transition duration-200 motion-reduce:transition-none",
                        chip.onApply
                          ? "opacity-70 outline-primary-300 hover:opacity-100"
                          : "outline-transparent"
                      )}
                      icon={chip.onApply ? Plus : undefined}
                      onClick={chip.onApply}
                      onRemove={chip.onRemove}
                    >
                      {chip.label}
                    </Chip>
                  </m.div>
                ))}
              </AnimatePresence>
              {isLoading && (
                <>
                  <LoadingBlock className="h-6 w-24 rounded-[9px]" />
                  <LoadingBlock className="h-6 w-32 rounded-[9px]" />
                </>
              )}
              {chips.length > 0 && (
                <m.div layout={!shouldReduceMotion} transition={transition}>
                  <Button
                    label={t`Clear all`}
                    size="xs"
                    variant="ghost-secondary"
                    onClick={onClearAll}
                  />
                </m.div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
