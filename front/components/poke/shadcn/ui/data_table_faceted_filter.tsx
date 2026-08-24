import { cn } from "@app/components/poke/shadcn/lib/utils";
import { PokeBadge } from "@app/components/poke/shadcn/ui/badge";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeCommand,
  PokeCommandGroup,
  PokeCommandItem,
  PokeCommandList,
  PokeCommandSeparator,
} from "@app/components/poke/shadcn/ui/command";
import {
  Check,
  PlusCircle,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Separator } from "@radix-ui/react-select";
import type { Column } from "@tanstack/react-table";
import type * as React from "react";

interface PokeDataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  selectedValues?: string[];
  onSelectedValuesChange?: (selectedValues: string[]) => void;
}

export function PokeDataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  selectedValues,
  onSelectedValuesChange,
}: PokeDataTableFacetedFilterProps<TData, TValue>) {
  const columnFilterValue = column?.getFilterValue();
  const columnSelectedValues = Array.isArray(columnFilterValue)
    ? columnFilterValue.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const selectedValueSet = new Set(selectedValues ?? columnSelectedValues);
  const facets = onSelectedValuesChange
    ? undefined
    : column?.getFacetedUniqueValues();

  const setSelectedValues = (values: string[]) => {
    if (onSelectedValuesChange) {
      onSelectedValuesChange(values);
    } else {
      column?.setFilterValue(values.length > 0 ? values : undefined);
    }
  };

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <PokeButton variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValueSet.size > 0 && (
            <>
              <Separator className="mx-2 h-4" />
              <PokeBadge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValueSet.size}
              </PokeBadge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValueSet.size > 2 ? (
                  <PokeBadge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValueSet.size} selected
                  </PokeBadge>
                ) : (
                  options
                    .filter((option) => selectedValueSet.has(option.value))
                    .map((option) => (
                      <PokeBadge
                        variant="secondary"
                        key={option.value}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </PokeBadge>
                    ))
                )}
              </div>
            </>
          )}
        </PokeButton>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] bg-primary-100 p-0" align="start">
        <PokeCommand>
          <PokeCommandList>
            <PokeCommandGroup>
              {options.map((option) => {
                const isSelected = selectedValueSet.has(option.value);

                return (
                  <PokeCommandItem
                    key={option.value}
                    onSelect={() => {
                      const nextSelectedValues = new Set(selectedValueSet);
                      if (isSelected) {
                        nextSelectedValues.delete(option.value);
                      } else {
                        nextSelectedValues.add(option.value);
                      }
                      setSelectedValues(Array.from(nextSelectedValues));
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "text-primary-foreground bg-primary"
                          : "[&_svg]:invisible"
                      )}
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    <span className="sr-only">
                      {isSelected ? " selected" : " not selected"}
                    </span>
                    {facets?.get(option.value) && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </PokeCommandItem>
                );
              })}
            </PokeCommandGroup>
            {selectedValueSet.size > 0 && (
              <>
                <PokeCommandSeparator />
                <PokeCommandGroup>
                  <PokeCommandItem
                    onSelect={() => setSelectedValues([])}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </PokeCommandItem>
                </PokeCommandGroup>
              </>
            )}
          </PokeCommandList>
        </PokeCommand>
      </PopoverContent>
    </PopoverRoot>
  );
}
