import type { ModelTierPickerOption } from "@app/lib/client/model_tier_options";
import { getModelTierPickerLabel } from "@app/lib/client/model_tier_options";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";

interface ModelTierPickerDropdownProps {
  selectedValue: string;
  options: ModelTierPickerOption[];
  onSelect: (value: string) => void | Promise<void>;
  readOnly?: boolean;
  isLoading?: boolean;
  isMutating?: boolean;
  className?: string;
}

export function ModelTierPickerDropdown({
  selectedValue,
  options,
  onSelect,
  readOnly = false,
  isLoading = false,
  isMutating = false,
  className,
}: ModelTierPickerDropdownProps) {
  if (isLoading) {
    return <Spinner size="xs" />;
  }

  const label = getModelTierPickerLabel({ selectedValue, options });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={label}
          disabled={readOnly || isMutating}
          className={className ?? "min-w-48 justify-between"}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            label={option.label}
            description={option.description}
            checked={selectedValue === option.value}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              void onSelect(option.value);
            }}
            onSelect={(event) => {
              event.preventDefault();
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
