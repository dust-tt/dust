import { isAdmin, type LightWorkspaceType } from "@app/types/user";
import { Chip, Input, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";
import type { SensitivityLabelsController } from "./types";

interface MicrosoftLabelsSelectorProps {
  owner: LightWorkspaceType;
  controller: SensitivityLabelsController;
  readOnly: boolean;
}

export function MicrosoftLabelsSelector({
  owner,
  controller,
  readOnly,
}: MicrosoftLabelsSelectorProps) {
  const [searchText, setSearchText] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const isAdminUser = isAdmin(owner);
  const {
    labels,
    pendingSelected,
    isEnabled,
    isSaving,
    isLoading,
    hasError,
    setIsEnabled,
    setPendingSelected,
  } = controller;

  const filteredLabels = labels.filter(
    (l) =>
      !pendingSelected.has(l.id) &&
      l.name.toLowerCase().includes(searchText.toLowerCase())
  );
  const shouldShowSuggestions = isEnabled && isSearchFocused;

  const handleToggle = () => {
    if (isEnabled) {
      setIsEnabled(false);
      setPendingSelected(new Set());
      setSearchText("");
    } else {
      setIsEnabled(true);
    }
  };

  const handleSelectLabel = (labelId: string) => {
    const next = new Set(pendingSelected);
    next.add(labelId);
    setPendingSelected(next);
    setSearchText("");
    setIsSearchFocused(false);
  };

  const handleRemoveLabel = (labelId: string) => {
    const next = new Set(pendingSelected);
    next.delete(labelId);
    setPendingSelected(next);
    if (next.size === 0) {
      setIsEnabled(false);
    }
  };

  const isDisabled = readOnly || !isAdminUser || isSaving || isLoading;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="heading-sm text-foreground dark:text-foreground-night">
          Allowed labels
        </span>
        <SliderToggle
          selected={isEnabled}
          onClick={handleToggle}
          disabled={isDisabled}
        />
      </div>
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        Only labeled content matching one of these labels will be synced.
        Unlabeled content is always included.
      </span>
      {isEnabled && (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Type a label"
            value={searchText}
            disabled={isDisabled}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          {shouldShowSuggestions && (
            <div className="max-h-48 overflow-auto rounded-md border border-border bg-background shadow-md dark:border-border-night dark:bg-background-night">
              {hasError ? (
                <p className="px-3 py-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Labels could not be retrieved. You must reconnect your
                  Microsoft connection to grant the necessary permissions.
                </p>
              ) : filteredLabels.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {labels.length === 0
                    ? "No labels found. Configure them in your Microsoft Purview console first."
                    : "No matching labels."}
                </p>
              ) : (
                filteredLabels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-muted dark:hover:bg-muted-night"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectLabel(label.id);
                    }}
                  >
                    {label.name}
                  </button>
                ))
              )}
            </div>
          )}
          {pendingSelected.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(pendingSelected).map((id) => {
                const label = labels.find((l) => l.id === id);
                return (
                  <Chip
                    key={id}
                    size="xs"
                    color="primary"
                    label={label?.name ?? id}
                    onRemove={
                      isDisabled ? undefined : () => handleRemoveLabel(id)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
