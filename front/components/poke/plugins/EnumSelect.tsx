import {
  ChevronDownIcon,
  cn,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Check } from "lucide-react";

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

interface EnumSelectProps {
  label?: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
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
              !value && "text-muted-foreground"
            )}
          >
            {value ? options.find((option) => option === value) : placeholder}
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
                  value={option}
                  key={option}
                  onSelect={() => {
                    onValueChange(option);
                  }}
                >
                  {option}
                  <Check
                    className={cn(
                      "ml-auto",
                      option === value ? "opacity-100" : "opacity-0"
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
