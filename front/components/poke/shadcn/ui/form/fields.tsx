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
import { ChevronDownIcon } from "lucide-react";
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
}: {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  options: SelectFieldOption[];
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
                  <Button
                    variant="outline"
                    label={displayLabel}
                    icon={ChevronDownIcon}
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
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
}: {
  control: Control<T>;
  name: Path<T>;
  title?: string;
  type?: "text" | "number";
  placeholder?: string;
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
              {...field}
              value={field.value}
              onChange={
                type === "number"
                  ? (e) => {
                      const parsed = Number(e.target.value);
                      if (isFinite(parsed)) {
                        field.onChange(parsed);
                      }
                    }
                  : field.onChange
              }
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}
