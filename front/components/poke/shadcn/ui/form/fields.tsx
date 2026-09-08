import {
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import { Fragment } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";

interface SelectFieldOption {
  value: string;
  display?: string;
}

interface SelectFieldOptionGroup {
  label: string;
  options: SelectFieldOption[];
}

type SelectFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  hideLabel?: boolean;
  mountPortalContainer?: HTMLElement;
} & (
  | { options: SelectFieldOption[]; groups?: never }
  | { groups: SelectFieldOptionGroup[]; options?: never }
);

export function SelectField<T extends FieldValues>({
  control,
  name,
  title,
  hideLabel,
  options,
  groups,
  mountPortalContainer,
}: SelectFieldProps<T>) {
  const flatOptions: SelectFieldOption[] =
    options ?? groups!.flatMap((g) => g.options);

  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedOption = flatOptions.find((o) => o.value === field.value);
        // Fall back to the title or a neutral placeholder — never the raw field
        // `name` (a dotted path like `seats.free.paymentSchedule.frequency`),
        // which leaks when the current value matches no option.
        const displayLabel =
          selectedOption?.display ??
          selectedOption?.value ??
          title ??
          "Select…";

        return (
          <PokeFormItem>
            {!hideLabel && (
              <PokeFormLabel className="capitalize">
                {title ?? name}
              </PokeFormLabel>
            )}
            <PokeFormControl>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" label={displayLabel} isSelect />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  mountPortalContainer={mountPortalContainer}
                >
                  {options &&
                    options.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        label={option.display ?? option.value}
                        onClick={() => field.onChange(option.value)}
                      />
                    ))}
                  {groups &&
                    groups
                      .filter((g) => g.options.length > 0)
                      .map((group, groupIdx) => (
                        <Fragment key={group.label}>
                          {groupIdx > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel label={group.label} />
                          {group.options.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              label={option.display ?? option.value}
                              onClick={() => field.onChange(option.value)}
                            />
                          ))}
                        </Fragment>
                      ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </PokeFormControl>
            <PokeFormMessage />
          </PokeFormItem>
        );
      }}
    />
  );
}

interface InputFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  hideLabel?: boolean;
  type?: "text" | "number" | "datetime-local";
  placeholder?: string;
  /** Native `min` attribute, useful for `number` and `datetime-local`. */
  min?: string;
  /** Native `max` attribute, useful for `number` and `datetime-local`. */
  max?: string;
  /** Native `step` attribute, useful for `number` and `datetime-local`. */
  step?: number | string;
  readOnly?: boolean;
  disabled?: boolean;
  /** Optional transform applied to the raw string value before updating the form. */
  transformValue?: (value: string) => string | number;
}

export function InputField<T extends FieldValues>({
  control,
  name,
  title,
  hideLabel,
  type,
  placeholder,
  min,
  max,
  step,
  readOnly,
  disabled,
  transformValue,
}: InputFieldProps<T>) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          {!hideLabel && (
            <PokeFormLabel className="capitalize">
              {title ?? name}
            </PokeFormLabel>
          )}
          <PokeFormControl>
            <Input
              placeholder={placeholder ?? name}
              type={type}
              min={min}
              max={max}
              step={step}
              {...field}
              value={field.value ?? ""}
              onChange={(e) => {
                if (transformValue) {
                  field.onChange(transformValue(e.target.value));
                  return;
                }

                if (type === "number") {
                  if (e.target.value === "") {
                    field.onChange(undefined);
                    return;
                  }
                  const parsed = Number(e.target.value);
                  if (isFinite(parsed)) {
                    field.onChange(parsed);
                  }
                  return;
                }

                field.onChange(e.target.value);
              }}
              readOnly={readOnly}
              disabled={disabled}
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}
