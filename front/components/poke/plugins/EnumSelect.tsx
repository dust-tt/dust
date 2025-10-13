import {
  ChevronDownIcon,
  cn,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { CheckCircle, Circle } from "lucide-react";
import React from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeCommand,
  PokeCommandEmpty,
  PokeCommandGroup,
  PokeCommandInput,
  PokeCommandItem,
  PokeCommandList,
} from "@app/components/poke/shadcn/ui/command";
import { PokeFormControl } from "@app/components/poke/shadcn/ui/form";
import type { AsyncEnumValues, EnumValues } from "@app/types/poke/plugins";

interface EnumSelectProps {
  label?: string;
  onValuesChange: (values: string[]) => void;
  options: AsyncEnumValues | EnumValues;
  placeholder?: string;
  values?: string[];
  multiple: boolean;
}

export function EnumSelect({
  label,
  onValuesChange,
  options,
  placeholder = "Select value",
  values,
  multiple,
}: EnumSelectProps) {
  const [open, setOpen] = React.useState(false);

  let title = values?.length ? values.sort().join(", ") : placeholder;

  if (title.length > 80) {
    title = `${values?.length} items selected`;
  }

  return (
    <PopoverRoot modal={true} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PokeFormControl>
          <PokeButton
            variant="outline"
            role="combobox"
            className={cn(
              "w-auto justify-between border-border-dark bg-background " +
                "dark:border-border-darker-night dark:bg-background-night",
              !values?.length &&
                "text-muted-foreground dark:text-muted-foreground-night"
            )}
          >
            {title}
            <ChevronDownIcon className="opacity-50" />
          </PokeButton>
        </PokeFormControl>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <PokeCommand className="gap-2 py-3">
          <PokeCommandInput placeholder={label} className="h-9 p-2" />
          <PokeCommandList>
            <PokeCommandEmpty>No values found.</PokeCommandEmpty>
            <PokeCommandGroup>
              {options.map((option) => {
                const isSelected = values?.includes(option.value);
                return (
                  <PokeCommandItem
                    value={option.value}
                    key={option.value}
                    onSelect={() => {
                      onValuesChange([option.value]);
                      if (!multiple) {
                        setOpen(false);
                      } else {
                        if (isSelected) {
                          onValuesChange(
                            values?.filter((value) => value !== option.value) ??
                              []
                          );
                        } else {
                          onValuesChange([...(values ?? []), option.value]);
                        }
                      }
                    }}
                  >
                    <div className="flex w-full items-center gap-2">
                      {multiple ? (
                        isSelected ? (
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-600-night" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-400 dark:text-gray-400-night" />
                        )
                      ) : null}
                      <span
                        className={cn(
                          option.checked && "font-medium",
                          "text-gray-900 dark:text-gray-900-night"
                        )}
                      >
                        {option.label}
                      </span>
                    </div>
                  </PokeCommandItem>
                );
              })}
            </PokeCommandGroup>
          </PokeCommandList>
        </PokeCommand>
      </PopoverContent>
    </PopoverRoot>
  );
}
