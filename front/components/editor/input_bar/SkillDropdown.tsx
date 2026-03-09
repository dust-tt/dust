import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  SkillDropdownOnKeyDown,
  SkillDropdownProps,
} from "@app/components/editor/input_bar/types";
import { getSkillIcon } from "@app/lib/skill";
import { useSkills } from "@app/lib/swr/skill_configurations";

export const SkillDropdown = forwardRef<
  SkillDropdownOnKeyDown,
  SkillDropdownProps
>(({ query, clientRect, command, onClose, owner, selectedSkillsRef }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const triggerRect = clientRect?.();

  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    globalSpaceOnly: true,
  });

  const filteredSkills = useMemo(() => {
    const selectedIds = new Set(
      selectedSkillsRef.current.map((s) => s.sId)
    );
    const available = skills.filter((s) => !selectedIds.has(s.sId));

    if (!query) {
      return available;
    }

    const lowerQuery = query.toLowerCase();
    return available.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.userFacingDescription.toLowerCase().includes(lowerQuery)
    );
  }, [skills, query, selectedSkillsRef]);

  const selectedItemRef = useRef<HTMLDivElement>(null);

  const selectItem = (index: number) => {
    const item = filteredSkills[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex(
          (selectedIndex + filteredSkills.length - 1) % filteredSkills.length
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        if (filteredSkills.length === 0) {
          return false;
        }
        setSelectedIndex((selectedIndex + 1) % filteredSkills.length);
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (filteredSkills.length === 0) {
          return false;
        }
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredSkills]);

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  if (!triggerRect) {
    return null;
  }

  const contentKey = isSkillsLoading
    ? "loading"
    : filteredSkills.length === 0
      ? "empty"
      : `results-${filteredSkills.length}`;

  if (filteredSkills.length === 0 && !isSkillsLoading) {
    return null;
  }

  const virtualTriggerStyle: React.CSSProperties = {
    position: "fixed",
    left: triggerRect.left,
    top:
      triggerRect.top +
      (typeof window === "undefined"
        ? 0
        : (window.visualViewport?.offsetTop ?? 0)),
    width: 1,
    height: triggerRect.height || 1,
    pointerEvents: "none",
    zIndex: -1,
    padding: 0,
    minWidth: 0,
    border: "none",
    background: "transparent",
  };

  return (
    <DropdownMenu open={true}>
      <DropdownMenuTrigger asChild>
        <div style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        key={contentKey}
        className="w-72"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={() => {
          onClose?.();
        }}
        onInteractOutside={() => {
          onClose?.();
        }}
      >
        {isSkillsLoading ? (
          <div className="flex h-12 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : filteredSkills.length > 0 ? (
          <div className="max-h-60">
            {filteredSkills.map((skill, index) => {
              const SkillIcon = getSkillIcon(skill.icon);
              return (
                <DropdownMenuItem
                  key={skill.sId}
                  ref={index === selectedIndex ? selectedItemRef : null}
                  className={cn(
                    index === selectedIndex
                      ? "text-highlight-500"
                      : "text-foreground dark:text-foreground-night"
                  )}
                  onClick={() => {
                    selectItem(index);
                  }}
                  onMouseEnter={() => {
                    setSelectedIndex(index);
                  }}
                >
                  <div className="flex w-full items-center gap-x-2">
                    <SkillIcon className="size-4 shrink-0" />
                    <span
                      className="truncate font-semibold"
                      title={skill.name}
                    >
                      {skill.name}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        ) : (
          <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            No result
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

SkillDropdown.displayName = "SkillDropdown";
