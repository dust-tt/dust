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
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import type { Control, FieldValues, Path } from "react-hook-form";

interface SelectFieldOption {
  value: string;
  display?: string;
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  title,
  options,
  mountPortalContainer,
}: {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  options: SelectFieldOption[];
  mountPortalContainer?: HTMLElement;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedOption = options.find((o) => o.value === field.value);
        const displayLabel =
          selectedOption?.display ?? selectedOption?.value ?? title ?? name;

        return (
          <PokeFormItem>
            <PokeFormLabel className="capitalize">
              {title ?? name}
            </PokeFormLabel>
            <PokeFormControl>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" label={displayLabel} isSelect />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  mountPortalContainer={mountPortalContainer}
                >
                  {options.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      label={option.display ?? option.value}
                      onClick={() => field.onChange(option.value)}
                    />
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

export function InputField<T extends FieldValues>({
  control,
  name,
  title,
  type,
  placeholder,
  min,
  step,
  transformValue,
}: {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  type?: "text" | "number" | "datetime-local";
  placeholder?: string;
  /** Native `min` attribute, useful for `number` and `datetime-local`. */
  min?: string;
  /** Native `step` attribute, useful for `number` and `datetime-local`. */
  step?: number | string;
  /** Optional transform applied to the raw string value before updating the form. */
  transformValue?: (value: string) => string | number;
}) {
  return (
    <PokeFormField
      control={control}
      name={name}
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <Input
              placeholder={placeholder ?? name}
              type={type}
              min={min}
              step={step}
              {...field}
              value={field.value}
              onChange={(e) => {
                if (transformValue) {
                  field.onChange(transformValue(e.target.value));
                  return;
                }

                if (type === "number") {
                  const parsed = Number(e.target.value);
                  if (isFinite(parsed)) {
                    field.onChange(parsed);
                  }
                  return;
                }

                field.onChange(e.target.value);
              }}
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}
