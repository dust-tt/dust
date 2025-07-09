import {
  ChevronDownIcon,
  cn,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Check, CheckCircle, Circle } from "lucide-react";

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
  onValueChange: (value: string) => void;
  options: AsyncEnumValues | EnumValues;
  placeholder?: string;
  value: string;
}

export function EnumSelect({
  label,
  onValueChange,
  options,
  placeholder = "Select value",
  value,
}: EnumSelectProps) {
  return (
    <PopoverRoot modal={false}>
      <PopoverTrigger asChild>
        <PokeFormControl>
          <PokeButton
            variant="outline"
            role="combobox"
            className={cn(
              "w-auto justify-between",
              !value && "text-muted-foreground dark:text-muted-foreground-night"
            )}
          >
            {value
              ? options.find((option) => option.value === value)?.label
              : placeholder}
            <ChevronDownIcon className="opacity-50" />
          </PokeButton>
        </PokeFormControl>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        mountPortal={false}
        align="start"
      >
        <PokeCommand className="gap-2 py-3">
          <PokeCommandInput placeholder={label} className="h-9 p-2" />
          <PokeCommandList>
            <PokeCommandEmpty>No values found.</PokeCommandEmpty>
            <PokeCommandGroup>
              {options.map((option) => (
                <PokeCommandItem
                  value={option.value}
                  key={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                  }}
                >
                  <div className="flex w-full items-center gap-2">
                    {"checked" in option &&
                      (option.checked ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-600-night" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-400 dark:text-gray-400-night" />
                      ))}
                    <span
                      className={cn(
                        option.checked && "font-medium",
                        "text-gray-900 dark:text-gray-900-night"
                      )}
                    >
                      {option.label}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      "ml-auto",
                      option.value === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </PokeCommandItem>
              ))}
            </PokeCommandGroup>
          </PokeCommandList>
        </PokeCommand>
      </PopoverContent>
    </PopoverRoot>
  );
}
