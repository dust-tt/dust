import type { SearchFilterFacets } from "@app/components/shared/filter_panel/searchFilter";
import { Slider, Spinner } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

interface UsageRange {
  min: number;
  max: number;
}

interface UsageRangeFilterProps {
  bounds: SearchFilterFacets["usage"];
  selected: UsageRange | undefined;
  isLoading: boolean;
  onChange: (range: UsageRange | undefined) => void;
}

function clamp(value: number, { min, max }: UsageRange): number {
  return Math.min(max, Math.max(min, value));
}

// Picks an active users range within the bounds of the matching resources; the whole range means
// no filter.
export function UsageRangeFilter({
  bounds,
  selected,
  isLoading,
  onChange,
}: UsageRangeFilterProps) {
  const { t } = useLingui();

  if (isLoading && !bounds) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }
  if (
    bounds?.min === null ||
    bounds?.max === null ||
    bounds === undefined ||
    bounds.min === bounds.max
  ) {
    return (
      <div className="flex h-24 items-center justify-center px-2 text-center text-sm text-muted-foreground">
        <Trans>Not enough usage data to filter on.</Trans>
      </div>
    );
  }

  const range = { min: bounds.min, max: bounds.max };
  const low = clamp(selected?.min ?? range.min, range);
  const high = clamp(selected?.max ?? range.max, range);
  const usageRange = low === high ? `${low}` : `${low}–${high}`;

  return (
    <div className="flex flex-col gap-3 px-2 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {t`${plural(high, {
          one: `${usageRange} active user`,
          other: `${usageRange} active users`,
        })}`}
        {isLoading && <Spinner size="xs" />}
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={1}
        minStepsBetweenThumbs={0}
        value={[low, high]}
        onValueChange={([nextLow = range.min, nextHigh = range.max]) =>
          onChange(
            nextLow === range.min && nextHigh === range.max
              ? undefined
              : { min: nextLow, max: nextHigh }
          )
        }
        showValueTooltip
        thumbAriaLabels={[t`Minimum active users`, t`Maximum active users`]}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{range.min}</span>
        <span>{range.max}</span>
      </div>
    </div>
  );
}
