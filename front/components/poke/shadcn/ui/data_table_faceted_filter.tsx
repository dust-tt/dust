import {
  CheckIcon,
  PlusCircleIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Separator } from "@radix-ui/react-select";
import type { Column } from "@tanstack/react-table";
import * as React from "react";

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

interface PokeDataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
}

export function PokeDataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: PokeDataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <PokeButton variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircleIcon className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator className="mx-2 h-4" />
              <PokeBadge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </PokeBadge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <PokeBadge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </PokeBadge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
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
                const isSelected = selectedValues.has(option.value);

                return (
                  <PokeCommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value);
                      } else {
                        selectedValues.add(option.value);
                      }
                      const filterValues = Array.from(selectedValues);

                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      );
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
                      <CheckIcon className={cn("h-4 w-4")} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    {facets?.get(option.value) && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </PokeCommandItem>
                );
              })}
            </PokeCommandGroup>
            {selectedValues.size > 0 && (
              <>
                <PokeCommandSeparator />
                <PokeCommandGroup>
                  <PokeCommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
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
