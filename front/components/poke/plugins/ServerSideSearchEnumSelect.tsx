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
import { useDebounce } from "@app/hooks/useDebounce";
import type { PokeSearchWorkspaceMember } from "@app/lib/api/poke/memberships";
import { usePokeWorkspaceMembersSearch } from "@app/poke/swr/memberships";
import type { EnumValue } from "@app/types/poke/plugins";
import {
  ChevronDown,
  cn,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Loader2 } from "lucide-react";
import React from "react";

function formatMemberLabel(member: PokeSearchWorkspaceMember) {
  return member.fullName
    ? `${member.fullName} (${member.email})`
    : `${member.email} (${member.sId})`;
}

interface ServerSideSearchEnumSelectProps {
  label?: string;
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  staticOptions?: readonly EnumValue[];
  values?: string[];
  workspaceId: string;
}

export function ServerSideSearchEnumSelect({
  label,
  onValuesChange,
  placeholder = "Select value",
  staticOptions = [],
  values,
  workspaceId,
}: ServerSideSearchEnumSelectProps) {
  const [open, setOpen] = React.useState(false);
  const {
    debouncedValue: debouncedSearchQuery,
    inputValue: searchQuery,
    setValue: setSearchQuery,
  } = useDebounce("");
  const [selectedMemberLabel, setSelectedMemberLabel] = React.useState<
    string | null
  >(null);

  const {
    members: searchResults,
    isLoading,
    isError,
  } = usePokeWorkspaceMembersSearch({
    owner: { sId: workspaceId },
    query: debouncedSearchQuery,
    disabled: !open,
  });

  const selectedValue = values?.[0] ?? "";

  const staticOptionByValue = React.useMemo(
    () => new Map(staticOptions.map((option) => [option.value, option])),
    [staticOptions]
  );

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open, setSearchQuery]);

  React.useEffect(() => {
    if (!selectedValue) {
      setSelectedMemberLabel(null);
      return;
    }

    const staticOption = staticOptionByValue.get(selectedValue);
    if (staticOption) {
      setSelectedMemberLabel(staticOption.label);
      return;
    }

    const matchingResult = searchResults.find(
      (member) => member.sId === selectedValue
    );
    if (matchingResult) {
      setSelectedMemberLabel(formatMemberLabel(matchingResult));
    }
  }, [searchResults, selectedValue, staticOptionByValue]);

  const title =
    selectedMemberLabel ??
    staticOptionByValue.get(selectedValue)?.label ??
    placeholder;

  return (
    <PopoverRoot modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PokeFormControl>
          <PokeButton
            variant="outline"
            role="combobox"
            className={cn(
              "w-auto justify-between border-border-dark bg-background " +
                "dark:border-border-darker-night dark:bg-background-night",
              !selectedValue &&
                "text-muted-foreground dark:text-muted-foreground-night"
            )}
          >
            {title}
            <ChevronDown className="opacity-50" />
          </PokeButton>
        </PokeFormControl>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[var(--radix-popover-trigger-width)] min-w-[320px]"
        mountPortal={false}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
        onWheelCapture={(e) => {
          e.stopPropagation();
        }}
        onTouchMoveCapture={(e) => {
          e.stopPropagation();
        }}
      >
        <PokeCommand className="gap-2 py-3" shouldFilter={false}>
          <PokeCommandInput
            placeholder={label ?? "Search by name or email"}
            className="h-9 p-2"
            value={searchQuery}
            onValueChange={setSearchQuery}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <PokeCommandList>
            {isLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching members…
              </div>
            ) : isError ? (
              <div className="px-2 py-3 text-sm text-warning-500">
                Failed to search workspace members.
              </div>
            ) : (
              <>
                <PokeCommandEmpty>No members found.</PokeCommandEmpty>
                <PokeCommandGroup>
                  {staticOptions.map((option) => {
                    const isSelected = selectedValue === option.value;
                    return (
                      <PokeCommandItem
                        value={option.label}
                        key={`static-${option.value}`}
                        onSelect={() => {
                          onValuesChange([option.value]);
                          setSelectedMemberLabel(option.label);
                          setOpen(false);
                        }}
                      >
                        <span
                          className={cn(
                            isSelected && "font-medium",
                            "text-gray-900 dark:text-gray-900-night"
                          )}
                        >
                          {option.label}
                        </span>
                      </PokeCommandItem>
                    );
                  })}
                  {searchResults
                    .filter((member) => !staticOptionByValue.has(member.sId))
                    .map((member) => {
                      const memberLabel = formatMemberLabel(member);
                      const isSelected = selectedValue === member.sId;

                      return (
                        <PokeCommandItem
                          value={memberLabel}
                          key={member.sId}
                          onSelect={() => {
                            onValuesChange([member.sId]);
                            setSelectedMemberLabel(memberLabel);
                            setOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              isSelected && "font-medium",
                              "text-gray-900 dark:text-gray-900-night"
                            )}
                          >
                            {memberLabel}
                          </span>
                        </PokeCommandItem>
                      );
                    })}
                </PokeCommandGroup>
              </>
            )}
          </PokeCommandList>
        </PokeCommand>
      </PopoverContent>
    </PopoverRoot>
  );
}
