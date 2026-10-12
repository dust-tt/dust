import { FieldRow } from "./SectionContainer";
import { Switch } from "./Switch";

export type CostManagementRowsProps = {
  ignoreCreditThreshold: boolean;
  onIgnoreCreditThresholdChange: (value: boolean) => void;
  isManager: boolean;
};

/** Managers only: whether this agent pauses at the workspace credit checkpoint. */
export function CostManagementRows({
  ignoreCreditThreshold,
  onIgnoreCreditThresholdChange,
  isManager,
}: CostManagementRowsProps) {
  if (!isManager) {
    return null;
  }
  return (
    <>
      <FieldRow
        label="Credit checkpoint"
        hint="Conversations keep going past it without asking for confirmation."
      >
        <span className="text-sm text-muted-foreground">
          {ignoreCreditThreshold ? "Ignore the alert" : "Ask before continuing"}
        </span>
        <Switch
          aria-label="Credit checkpoint"
          checked={ignoreCreditThreshold}
          onCheckedChange={onIgnoreCreditThresholdChange}
        />
      </FieldRow>
    </>
  );
}
