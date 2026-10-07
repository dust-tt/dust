import { Chip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export type SuggestedChangeAction = "add" | "remove";

interface SuggestedChangeRowProps {
  action: SuggestedChangeAction;
  visual?: ReactNode;
  title: string;
  description?: string;
}

export function SuggestedChangeRow({
  action,
  visual,
  title,
  description,
}: SuggestedChangeRowProps) {
  const { t } = useLingui();

  return (
    <div className="flex items-center gap-3 py-2.5">
      {visual}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{title}</div>
        {description && (
          <div className="truncate text-xs text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <Chip
        size="xs"
        color={action === "add" ? "highlight" : "warning"}
        label={
          action === "add"
            ? t({ message: "Add", context: "suggested change" })
            : t({ message: "Remove", context: "suggested change" })
        }
      />
    </div>
  );
}
