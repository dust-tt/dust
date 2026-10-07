import { Button } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface FilterFooterProps {
  onClearAll: () => void;
  onCancel: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
}

export function FilterFooter({
  onClearAll,
  onCancel,
  onApply,
  applyDisabled,
}: FilterFooterProps) {
  const { t } = useLingui();

  return (
    <div className="flex items-center justify-between border-t border-border p-2 dark:border-border-dark">
      <Button
        label={t`Clear filters`}
        size="xmini"
        variant="ghost-secondary"
        onClick={onClearAll}
      />
      <div className="flex items-center gap-2">
        <Button
          label={t`Cancel`}
          size="sm"
          variant="outline"
          onClick={onCancel}
        />
        <Button
          label={t`Apply`}
          size="sm"
          variant="highlight"
          onClick={onApply}
          disabled={applyDisabled}
        />
      </div>
    </div>
  );
}
