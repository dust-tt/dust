import type { OAuthScopeDefinition } from "@app/lib/actions/mcp_metadata_extraction";
import {
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface OAuthScopeCustomizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableScopes: OAuthScopeDefinition[];
  selectedScopes: string[];
  onConfirm: (selectedScopes: string[]) => void;
}

export function OAuthScopeCustomizationDialog({
  isOpen,
  onClose,
  availableScopes,
  selectedScopes,
  onConfirm,
}: OAuthScopeCustomizationDialogProps) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    () => new Set(selectedScopes)
  );

  // Re-sync local state whenever the dialog is opened.
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(selectedScopes));
    }
  }, [isOpen, selectedScopes]);

  const handleToggle = (scopeValue: string, required: boolean) => {
    if (required) {
      return;
    }
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scopeValue)) {
        next.delete(scopeValue);
      } else {
        next.add(scopeValue);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(localSelected));
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Customize OAuth scopes</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Select which permissions to request. Required scopes cannot be
            removed.
          </p>
          <div className="mt-4 space-y-3">
            {availableScopes
              .map((scope) => {
                const isImplied =
                  scope.impliedBy !== undefined &&
                  localSelected.has(scope.impliedBy);
                const isRequired = scope.required === true;
                const isChecked = localSelected.has(scope.value);
                const isDisabled = isRequired || isImplied;
                const badge = isImplied
                  ? "implied"
                  : isRequired
                    ? "required"
                    : undefined;
                return {
                  key: scope.value,
                  label: scope.label,
                  description: scope.description,
                  checked: isImplied ? true : isChecked,
                  disabled: isDisabled,
                  badge,
                  onToggle: isDisabled
                    ? undefined
                    : () => handleToggle(scope.value, false),
                };
              })
              .map((entry) => (
                <div
                  key={entry.key}
                  className={
                    entry.onToggle
                      ? "flex cursor-pointer items-start gap-3"
                      : "flex items-start gap-3"
                  }
                  onClick={entry.onToggle}
                >
                  <Checkbox
                    checked={entry.checked}
                    disabled={entry.disabled}
                    className="mt-0.5 shrink-0"
                    onCheckedChange={entry.onToggle}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                        {entry.label}
                      </span>
                      {entry.badge && (
                        <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          {entry.badge}
                        </span>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {entry.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Apply",
            variant: "primary",
            onClick: handleConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
