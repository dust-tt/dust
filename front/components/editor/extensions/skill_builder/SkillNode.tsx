import type { SkillNodeAttributes } from "@app/components/editor/extensions/input_bar/SkillNode";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { getSkillIcon } from "@app/lib/skill";
import { useSkill, useSkills } from "@app/lib/swr/skill_configurations";
import type {
  SkillType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import {
  AttachmentChip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface BaseSkillReferenceItem {
  icon: string | null;
  name: string;
  skillId: string;
}

export interface FullSkillReferenceItem extends BaseSkillReferenceItem {
  skill: SkillType | SkillWithoutInstructionsAndToolsType;
}

export type SkillReferenceItem =
  | BaseSkillReferenceItem
  | FullSkillReferenceItem;

export function isFullSkillReferenceItem(
  item: SkillReferenceItem,
): item is FullSkillReferenceItem {
  return "skill" in item && item.skill !== undefined;
}

export function skillReferenceItemFromAttributes(attrs: {
  skillIcon?: unknown;
  skillId?: unknown;
  skillName?: unknown;
}): BaseSkillReferenceItem | null {
  const { skillIcon, skillId, skillName } = attrs;

  if (typeof skillId !== "string" || typeof skillName !== "string") {
    return null;
  }

  return {
    icon: typeof skillIcon === "string" ? skillIcon : null,
    name: skillName,
    skillId,
  };
}

function skillNodeAttributesFromItem(
  item: SkillReferenceItem,
): SkillNodeAttributes {
  return {
    skillIcon: item.icon,
    skillId: item.skillId,
    skillName: item.name,
    skillSerializeIcon: false,
  };
}

interface SkillReferenceChipProps {
  color?: React.ComponentProps<typeof AttachmentChip>["color"];
  icon: string | null;
  name: string;
  onRemove?: () => void;
}

export function SkillReferenceChip({
  color = "white",
  icon,
  name,
  onRemove,
}: SkillReferenceChipProps) {
  return (
    <AttachmentChip
      label={name}
      icon={{ visual: getSkillIcon(icon) }}
      color={color}
      onRemove={onRemove}
      size="xs"
    />
  );
}

interface SkillReferenceErrorChipProps {
  name: string;
  onRemove?: () => void;
}

function SkillReferenceErrorChip({
  name,
  onRemove,
}: SkillReferenceErrorChipProps) {
  return (
    <AttachmentChip
      label={name}
      icon={{ visual: ExclamationCircleIcon }}
      color="white"
      onRemove={onRemove}
      size="xs"
    />
  );
}

interface SkillDisplayProps {
  item: SkillReferenceItem;
  onRemove?: () => void;
  updateAttributes: (attrs: Partial<SkillNodeAttributes>) => void;
}

function SkillDisplayComponent({
  item,
  onRemove,
  updateAttributes,
}: SkillDisplayProps) {
  const { owner } = useSpacesContext();
  const needsFetch = !isFullSkillReferenceItem(item);
  const { skill, isSkillLoading, isSkillError } = useSkill({
    workspaceId: owner.sId,
    skillId: item.skillId,
    disabled: !needsFetch,
  });

  useEffect(() => {
    if (!needsFetch || !skill || skill.status !== "active") {
      return;
    }

    updateAttributes({
      skillIcon: skill.icon,
      skillId: skill.sId,
      skillName: skill.name,
      skillSerializeIcon: false,
    });
  }, [needsFetch, skill, updateAttributes]);

  if (
    isSkillError ||
    (needsFetch && skill && skill.status !== "active") ||
    (needsFetch && !isSkillLoading && !skill)
  ) {
    return <SkillReferenceErrorChip name={item.name} onRemove={onRemove} />;
  }

  if (needsFetch && isSkillLoading) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1",
          "text-sm text-gray-600",
        )}
      >
        <Spinner size="xs" />
        <span>{item.name}</span>
      </span>
    );
  }

  return (
    <SkillReferenceChip icon={item.icon} name={item.name} onRemove={onRemove} />
  );
}

interface SkillSearchProps {
  clientRect?: () => DOMRect | null;
  onCancel: () => void;
  onSelect: (item: SkillReferenceItem) => void;
}

function SkillSearchComponent({
  clientRect,
  onCancel,
  onSelect,
}: SkillSearchProps) {
  const { owner } = useSpacesContext();
  const { skillId: currentSkillId } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    viewType: "summary",
  });

  const skillItems: FullSkillReferenceItem[] = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }

    return skills
      .filter((skill) => skill.createdAt !== null)
      .filter((skill) => skill.sId !== currentSkillId)
      .filter((skill) => skill.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((skill) => ({
        icon: skill.icon,
        name: skill.name,
        skill,
        skillId: skill.sId,
      }));
  }, [currentSkillId, searchQuery, skills]);

  const updateTriggerPosition = useCallback(() => {
    const triggerRect = clientRect?.();
    if (triggerRect && triggerRef.current) {
      setVirtualTriggerStyle({
        position: "fixed",
        left: triggerRect.left,
        top: triggerRect.top + (window.visualViewport?.offsetTop ?? 0),
        width: 1,
        height: triggerRect.height || 1,
        pointerEvents: "none",
        zIndex: -1,
      });
    }
  }, [clientRect]);

  useEffect(() => {
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    setTimeout(() => {
      if (!contentRef.current) {
        return;
      }

      contentRef.current.focus();
      const range = document.createRange();
      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      range.selectNodeContents(contentRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }, 10);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    setIsOpen(searchQuery.trim().length > 0);
  }, [searchQuery]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = skillItems[index];
      if (!item) {
        return;
      }

      onSelect(item);
      setIsOpen(false);
      setSelectedIndex(0);
      setSearchQuery("");
    },
    [onSelect, skillItems],
  );

  const deleteIfEmpty = useCallback(
    (delayMs: number = 50) => {
      setTimeout(() => {
        if (!searchQuery.trim()) {
          onCancel();
        }
      }, delayMs);
    },
    [onCancel, searchQuery],
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
    setSearchQuery(e.currentTarget.textContent ?? "");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (!isOpen || skillItems.length === 0) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((selectedIndex + 1) % skillItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(
          (selectedIndex + skillItems.length - 1) % skillItems.length,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        handleItemSelect(selectedIndex);
      }
    },
    [handleItemSelect, isOpen, onCancel, selectedIndex, skillItems.length],
  );

  const handleInteractOutside = useCallback(() => {
    setIsOpen(false);
    deleteIfEmpty(50);
  }, [deleteIfEmpty]);

  return (
    <div className="relative inline-block">
      <span
        className={cn(
          "inline-block h-7 cursor-text px-3 py-1 text-sm font-normal",
          "rounded bg-gray-100 dark:bg-gray-800",
          "text-center text-gray-500 dark:text-gray-500-night",
          "empty:before:content-[attr(data-placeholder)] focus:outline-none",
          "min-w-36 text-left",
        )}
        contentEditable
        suppressContentEditableWarning
        ref={contentRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        data-placeholder="Search for a skill..."
      />

      {isOpen && (
        <DropdownMenu open={true}>
          <DropdownMenuTrigger asChild>
            <div ref={triggerRef} style={virtualTriggerStyle} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-96"
            align="start"
            avoidCollisions
            onInteractOutside={handleInteractOutside}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {isSkillsLoading ? (
              <div className="flex h-14 items-center justify-center">
                <Spinner size="sm" />
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
                  Searching skills...
                </span>
              </div>
            ) : skillItems.length === 0 ? (
              <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
                {searchQuery.length < 2
                  ? "Type at least 2 characters to search"
                  : "No skills found"}
              </div>
            ) : (
              skillItems.map((item, index) => (
                <DropdownMenuItem
                  key={item.skillId}
                  icon={<Icon visual={getSkillIcon(item.icon)} size="md" />}
                  label={item.name}
                  description={item.skill.userFacingDescription}
                  truncateText
                  onClick={() => handleItemSelect(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={
                    index === selectedIndex
                      ? "bg-gray-100 dark:bg-gray-800"
                      : ""
                  }
                />
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface ExtendedNodeViewProps extends ReactNodeViewProps {
  clientRect?: () => DOMRect | null;
}

export const SkillReferenceNodeView: React.FC<ExtendedNodeViewProps> = ({
  clientRect,
  deleteNode,
  editor,
  node,
  updateAttributes,
}) => {
  const item = skillReferenceItemFromAttributes(node.attrs);

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode],
  );

  const handleCancel = useCallback(() => {
    deleteNode();
    queueMicrotask(() => {
      if (editor && !editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }, [deleteNode, editor]);

  const handleSelect = useCallback(
    (item: SkillReferenceItem) => {
      updateAttributes(skillNodeAttributesFromItem(item));

      queueMicrotask(() => {
        if (editor && !editor.isDestroyed) {
          editor.chain().focus().insertContent(" ").run();
        }
      });
    },
    [editor, updateAttributes],
  );

  if (item) {
    return (
      <NodeViewWrapper className="inline">
        <SkillDisplayComponent
          item={item}
          onRemove={editor.isEditable ? handleRemove : undefined}
          updateAttributes={updateAttributes}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="inline">
      <SkillSearchComponent
        onSelect={handleSelect}
        onCancel={handleCancel}
        clientRect={clientRect}
      />
    </NodeViewWrapper>
  );
};
