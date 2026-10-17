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
        hint={
          ignoreCreditThreshold
            ? "Conversations keep going past the workspace credit alert without asking."
            : "Conversations pause at the workspace credit alert and ask before continuing."
        }
      >
        <Switch
          aria-label="Credit checkpoint"
          checked={ignoreCreditThreshold}
          onCheckedChange={onIgnoreCreditThresholdChange}
        />
      </FieldRow>
    </>
  );
}
