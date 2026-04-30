import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { getSkillIcon } from "@app/lib/skill";
import { useSkill, useSkills } from "@app/lib/swr/skill_configurations";
import {
  parseSkillReferences,
  serializeSkillReference,
} from "@app/lib/skill_references";
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
import { Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
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

export interface SkillNodeAttributes {
  selectedItems: SkillReferenceItem[];
}

export function isFullSkillReferenceItem(
  item: SkillReferenceItem,
): item is FullSkillReferenceItem {
  return "skill" in item && item.skill !== undefined;
}

const SKILL_CHIP_CLASS =
  "inline-flex items-center gap-0.5 border border-current/40 rounded px-0.5 text-xs leading-tight";
const SKILL_REFERENCE_TAG_REGEX = /^<skill\s+([^>]+)\s*\/>/;

const SkillNodeReadOnlyView: React.FC<NodeViewProps> = ({ node }) => {
  const { selectedItems } = node.attrs as SkillNodeAttributes;
  const item = selectedItems[0];
  if (!item) {
    return null;
  }

  return (
    <NodeViewWrapper as="span" className={SKILL_CHIP_CLASS}>
      <span>Skill</span>
      <span>{` ${item.name}`}</span>
    </NodeViewWrapper>
  );
};

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
      selectedItems: [
        {
          icon: skill.icon,
          name: skill.name,
          skill,
          skillId: skill.sId,
        },
      ],
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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillNode: {
      insertSkillNode: () => ReturnType;
    };
  }
}

export const SKILL_NODE_TYPE = "skillNode";

export interface SkillNodeOptions {
  readOnly: boolean;
}

export const SkillNode = Node.create<SkillNodeOptions>({
  addOptions() {
    return { readOnly: false };
  },
  name: SKILL_NODE_TYPE,

  group: "inline",
  inline: true,
  atom: false,
  selectable: false,

  markdownTokenizer: {
    name: "skillNode",
    level: "inline",
    start: (src) => src.indexOf("<skill"),
    tokenize: (src) => {
      const match = SKILL_REFERENCE_TAG_REGEX.exec(src);
      if (!match) {
        return undefined;
      }

      const reference = parseSkillReferences(match[0])[0];
      if (!reference) {
        return undefined;
      }

      return {
        type: "skillNode",
        raw: match[0],
        skillId: reference.skillId,
        skillName: reference.name,
      };
    },
  },

  addAttributes() {
    return {
      selectedItems: {
        default: [],
        parseHTML: (element) => {
          if (element.tagName.toLowerCase() !== "skill") {
            return [];
          }

          const skillId = element.getAttribute("id");
          const name = element.getAttribute("name");
          if (!skillId || !name) {
            return [];
          }

          return [
            {
              icon: null,
              name,
              skillId,
            } satisfies BaseSkillReferenceItem,
          ];
        },
        renderHTML: (attributes) => {
          const item = (attributes.selectedItems as SkillReferenceItem[])[0];
          if (!item) {
            return {};
          }

          return {
            id: item.skillId,
            name: item.name,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "skill" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { selectedItems } = node.attrs as SkillNodeAttributes;
    const item = selectedItems[0];

    if (item) {
      return [
        "skill",
        HTMLAttributes,
        [
          "span",
          { class: SKILL_CHIP_CLASS },
          ["span", {}, "Skill"],
          ["span", {}, ` ${item.name}`],
        ],
      ];
    }

    return ["span", {}];
  },

  renderMarkdown: (node) => {
    const selectedItems = node.attrs?.selectedItems as
      | SkillReferenceItem[]
      | undefined;
    const item = selectedItems?.[0];
    if (!item) {
      return "";
    }

    return serializeSkillReference({
      name: item.name,
      skillId: item.skillId,
    });
  },

  parseMarkdown: (token) => {
    return {
      type: "skillNode",
      attrs: {
        selectedItems: [
          {
            icon: null,
            name: token.skillName,
            skillId: token.skillId,
          },
        ],
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      this.options.readOnly ? SkillNodeReadOnlyView : SkillNodeView,
    );
  },

  addCommands() {
    return {
      insertSkillNode:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              selectedItems: [],
            },
          });
        },
    };
  },
});

interface ExtendedNodeViewProps extends NodeViewProps {
  clientRect?: () => DOMRect | null;
}

const SkillNodeView: React.FC<ExtendedNodeViewProps> = ({
  clientRect,
  deleteNode,
  editor,
  node,
  updateAttributes,
}) => {
  const { selectedItems } = node.attrs as SkillNodeAttributes;

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
      updateAttributes({
        selectedItems: [item],
      });

      queueMicrotask(() => {
        if (editor && !editor.isDestroyed) {
          editor.chain().focus().insertContent(" ").run();
        }
      });
    },
    [editor, updateAttributes],
  );

  if (selectedItems.length > 0) {
    return (
      <NodeViewWrapper className="inline">
        <SkillDisplayComponent
          item={selectedItems[0]}
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
