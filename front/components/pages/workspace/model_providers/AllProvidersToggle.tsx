import {
  ALL_PROVIDERS_SELECTED,
  type ProvidersSelection,
} from "@app/types/provider_selection";
import { SliderToggle } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface AllProvidersToggleProps {
  setProvidersSelection: (states: ProvidersSelection) => void;
  providersSelection: ProvidersSelection;
}

export function AllProvidersToggle({
  setProvidersSelection,
  providersSelection,
}: AllProvidersToggleProps) {
  const selected = useMemo(
    () => Object.values(providersSelection).every(Boolean),
    [providersSelection]
  );

  return (
    <div className="mt-8 divide-y divide-gray-200 dark:divide-gray-200-night p-3">
      <div className="flex items-center justify-between">
        <span className="text-left font-semibold text-foreground dark:text-foreground-night">
          Make all providers available
        </span>
        <SliderToggle
          size="xs"
          selected={selected}
          disabled={selected}
          onClick={() => {
            setProvidersSelection(ALL_PROVIDERS_SELECTED);
          }}
        />
      </div>
    </div>
  );
}
