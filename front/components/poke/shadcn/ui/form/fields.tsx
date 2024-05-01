import type { Control, FieldValues, Path } from "react-hook-form";

import {
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
  PokeFormMessage,
} from "@app/components/poke/shadcn/ui/form";
import { PokeInput } from "@app/components/poke/shadcn/ui/input";
import {
  PokeSelect,
  PokeSelectContent,
  PokeSelectItem,
  PokeSelectTrigger,
  PokeSelectValue,
} from "@app/components/poke/shadcn/ui/select";

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
      render={({ field }) => (
        <PokeFormItem>
          <PokeFormLabel className="capitalize">{title ?? name}</PokeFormLabel>
          <PokeFormControl>
            <PokeSelect
              onValueChange={field.onChange}
              value={field.value as string}
            >
              <PokeFormControl>
                <PokeSelectTrigger>
                  <PokeSelectValue placeholder={title ?? name} />
                </PokeSelectTrigger>
              </PokeFormControl>
              <PokeSelectContent>
                <div className="bg-slate-100">
                  {options.map((option) => (
                    <PokeSelectItem key={option.value} value={option.value}>
                      {option.display ? option.display : option.value}
                    </PokeSelectItem>
                  ))}
                </div>
              </PokeSelectContent>
            </PokeSelect>
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
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
            <PokeInput
              placeholder={placeholder ?? name}
              type={type}
              {...field}
              value={field.value}
            />
          </PokeFormControl>
          <PokeFormMessage />
        </PokeFormItem>
      )}
    />
  );
}
