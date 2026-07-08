import type { CapabilityFilterType } from "@app/components/shared/tools_picker/types";
import { NewButton } from "@dust-tt/sparkle";

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
    <div className="flex gap-2">
      <NewButton
        label="All"
        variant={filter === "all" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("all")}
      />
      <NewButton
        label="Skills"
        variant={filter === "skills" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("skills")}
      />
      <NewButton
        label="Tools"
        variant={filter === "tools" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("tools")}
      />
    </div>
  );
}
