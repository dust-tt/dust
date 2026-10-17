import {
  Button,
  Check,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@dust-tt/sparkle";

export type ValueOption<T extends string> = {
  id: T;
  label: string;
  /** One line under the label explaining what the choice means. */
  description?: string;
  disabled?: boolean;
  tooltip?: string;
};

/**
 * The one way a field row exposes a value setting: the current value as quiet
 * text with a chevron, a menu of options with a check on the current one.
 * Used for models, formats, schedules and destinations alike so every row
 * reads the same way.
 */
export function ValueMenu<T extends string>({
  value,
  options,
  onSelect,
  ariaLabel,
  disabled = false,
  icon,
  tooltip,
  contentClassName,
}: {
  value: T;
  options: ValueOption<T>[];
  onSelect: (id: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  icon?: React.ComponentType;
  tooltip?: string;
  contentClassName?: string;
}) {
  const current = options.find((option) => option.id === value);
  const label = current?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost-secondary"
          isSelect
          icon={icon}
          label={label}
          disabled={disabled}
          tooltip={tooltip}
          aria-label={`${ariaLabel}: ${label}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
            tooltip={option.tooltip}
            onSelect={() => onSelect(option.id)}
            endComponent={
              option.id === value ? (
                <Icon visual={Check} size="xs" />
              ) : undefined
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
