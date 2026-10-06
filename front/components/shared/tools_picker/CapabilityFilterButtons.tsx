import type { CapabilityFilterType } from "@app/components/shared/tools_picker/types";
import { Button } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();

  return (
    <div className="flex gap-2">
      <Button
        label={t({ message: "All", context: "capability filter" })}
        variant={filter === "all" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("all")}
      />
      <Button
        label={t`Skills`}
        variant={filter === "skills" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("skills")}
      />
      <Button
        label={t`Tools`}
        variant={filter === "tools" ? "primary" : "outline"}
        size={size}
        onClick={() => setFilter("tools")}
      />
    </div>
  );
}
