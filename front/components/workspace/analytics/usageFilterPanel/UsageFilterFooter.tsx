import { Button } from "@dust-tt/sparkle";

interface UsageFilterFooterProps {
  onClearAll: () => void;
  onCancel: () => void;
  onApply: () => void;
}

export function UsageFilterFooter({
  onClearAll,
  onCancel,
  onApply,
}: UsageFilterFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border p-2">
      <Button
        label="Clear filters"
        size="xmini"
        variant="ghost-secondary"
        onClick={onClearAll}
      />
      <div className="flex items-center gap-2">
        <Button label="Cancel" size="sm" variant="outline" onClick={onCancel} />
        <Button label="Apply" size="sm" variant="highlight" onClick={onApply} />
      </div>
    </div>
  );
}
