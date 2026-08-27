import type { CapabilityFilterType } from "@app/components/shared/tools_picker/types";
import { FilterChips } from "@dust-tt/sparkle";

const CAPABILITY_FILTERS: CapabilityFilterType[] = ["all", "skills", "tools"];

const CAPABILITY_FILTER_LABELS: Record<CapabilityFilterType, string> = {
  all: "All",
  skills: "Skills",
  tools: "Tools",
};

interface CapabilityFilterButtonsProps {
  filter: CapabilityFilterType;
  setFilter: (filter: CapabilityFilterType) => void;
  size?: "xs" | "sm";
}

export function CapabilityFilterButtons({
  filter,
  setFilter,
  size = "sm",
}: CapabilityFilterButtonsProps) {
  return (
    <FilterChips
      filters={CAPABILITY_FILTERS}
      selectedFilter={filter}
      onFilterClick={setFilter}
      getLabel={(f) => CAPABILITY_FILTER_LABELS[f]}
      size={size}
    />
  );
}
