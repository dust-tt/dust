import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { DocumentIcon } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { KnowledgeItem, KnowledgeNodeAttributes } from "./KnowledgeNode";

export const KnowledgeNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  editor,
}) => {
  const { selectedItems, isSearching } = node.attrs as KnowledgeNodeAttributes;
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  // Mock knowledge items - filtered by search query.
  const knowledgeItems: KnowledgeItem[] = useMemo(() => {
    const allItems = [
      {
        id: "marketing-strategy",
        label: "Marketing Strategy 2024",
        description:
          "Complete marketing plan with target audiences and campaigns",
      },
      {
        id: "product-roadmap",
        label: "Product Roadmap Q1-Q4",
        description: "Feature priorities and development timeline",
      },
      {
        id: "sales-playbook",
        label: "Sales Playbook",
        description:
          "Sales processes, objection handling, and closing techniques",
      },
      {
        id: "brand-guidelines",
        label: "Brand Guidelines",
        description: "Logo usage, colors, typography, and voice & tone",
      },
      {
        id: "customer-personas",
        label: "Customer Personas",
        description: "Detailed profiles of target customer segments",
      },
      {
        id: "pricing-strategy",
        label: "Pricing Strategy",
        description: "Pricing models, tiers, and competitive analysis",
      },
      {
        id: "content-calendar",
        label: "Content Calendar",
        description: "Social media and blog post scheduling",
      },
      {
        id: "onboarding-guide",
        label: "Customer Onboarding Guide",
        description: "Step-by-step process for new customer success",
      },
      {
        id: "competitor-analysis",
        label: "Competitor Analysis",
        description: "Market landscape and competitive positioning",
      },
      {
        id: "growth-metrics",
        label: "Growth Metrics Dashboard",
        description: "KPIs, conversion rates, and performance tracking",
      },
      {
        id: "user-research",
        label: "User Research Findings",
        description: "Customer interviews and usability testing results",
      },
      {
        id: "technical-docs",
        label: "Technical Documentation",
        description: "Architecture overview and implementation guides",
      },
    ];

    if (!searchQuery.trim()) {
      return allItems;
    }

    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = knowledgeItems[index];
      if (item) {
        updateAttributes({
          selectedItems: [item],
          isSearching: false,
        });
        setIsOpen(false);
        setSelectedIndex(0);
        setSearchQuery("");

        // Return focus to the editor after selection and add a space.
        setTimeout(() => {
          if (editor) {
            editor.chain().focus().insertContent(" ").run();
          }
        }, 10);
      }
    },
    [knowledgeItems, updateAttributes, editor]
  );

  const handleItemClick = useCallback(
    (item: KnowledgeItem) => {
      const index = knowledgeItems.findIndex((i) => i.id === item.id);
      if (index !== -1) {
        handleItemSelect(index);
      }
    },
    [knowledgeItems, handleItemSelect]
  );

  // Listen for input events to update search query and dropdown state.
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      const text = e.currentTarget.textContent ?? "";
      setSearchQuery(text);

      if (text.trim() && !isOpen) {
        setIsOpen(true);
      } else if (!text.trim() && isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen]
  );

  // Auto-focus when node is created or component mounts.
  useEffect(() => {
    if (isSearching && selectedItems.length === 0 && contentRef.current) {
      // Use setTimeout to ensure the DOM is ready.
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();

          // Set cursor at the end of any existing text.
          const range = document.createRange();
          const sel = window.getSelection();
          if (sel) {
            range.selectNodeContents(contentRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 10); // Slightly longer delay to ensure the node is fully rendered.
    }
  }, [isSearching, selectedItems.length]);

  // Additional focus trigger on mount.
  useEffect(() => {
    if (isSearching && selectedItems.length === 0) {
      const focusTimer = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 50);

      return () => clearTimeout(focusTimer);
    }
  }); // Only run on mount.

  // Reset selected index when items change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [knowledgeItems.length]);

  // Delete empty node helper.
  const deleteIfEmpty = useCallback(
    (delay: number = 50) => {
      setTimeout(() => {
        if (isSearching && selectedItems.length === 0 && !searchQuery.trim()) {
          deleteNode();
        }
      }, delay);
    },
    [isSearching, selectedItems.length, searchQuery, deleteNode]
  );

  // Add global click handler to catch clicks outside when dropdown isn't open.
  useEffect(() => {
    if (!isSearching || selectedItems.length > 0) {
      return;
    }

    const handleGlobalClick = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        deleteIfEmpty(50);
      }
    };

    document.addEventListener("click", handleGlobalClick, true);
    return () => document.removeEventListener("click", handleGlobalClick, true);
  }, [isSearching, selectedItems.length, deleteIfEmpty]);

  // Handle keyboard navigation.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || selectedItems.length > 0) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % knowledgeItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (selectedIndex + knowledgeItems.length - 1) % knowledgeItems.length
        );
      } else if (e.key === "Enter" && knowledgeItems.length > 0) {
        e.preventDefault();
        handleItemSelect(selectedIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        deleteNode();
      }
    },
    [
      isOpen,
      selectedItems.length,
      selectedIndex,
      knowledgeItems.length,
      handleItemSelect,
      deleteNode,
    ]
  );

  // Handle blur: delete node if it's empty and in search mode.
  const handleBlur = useCallback(() => {
    deleteIfEmpty(100);
  }, [deleteIfEmpty]);

  // Handle click outside: also delete node if empty.
  const handleInteractOutside = useCallback(() => {
    setIsOpen(false);
    deleteIfEmpty(50);
  }, [deleteIfEmpty]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  if (selectedItems.length > 0) {
    // Show selected knowledge as simple inline text.
    // TODO(2026-01-02 SKILLS): Use the same chip as the url one in the input bar.
    return (
      <NodeViewWrapper className="inline">
        <span className="text-blue-600 dark:text-blue-400">
          📚 {selectedItems[0].label}
        </span>
        <button
          onClick={handleRemove}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
          title="Remove knowledge"
        >
          ×
        </button>
      </NodeViewWrapper>
    );
  }

  // Show editable search node.
  return (
    <NodeViewWrapper className="inline">
      <div className="relative inline-block">
        <span
          className={cn(
            "inline-block cursor-text rounded-md bg-gray-100 px-3 py-1 text-sm italic",
            "text-gray-600 empty:before:text-gray-400",
            "empty:before:content-[attr(data-placeholder)] focus:outline-none"
          )}
          contentEditable
          suppressContentEditableWarning
          ref={contentRef}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          data-placeholder="Search for knowledge..."
          style={{
            minWidth: searchQuery ? "auto" : "150px",
            textAlign: "left",
          }}
        ></span>

        {isOpen && knowledgeItems.length > 0 && (
          <DropdownMenu open={true}>
            <DropdownMenuTrigger asChild>
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  width: "100%",
                  height: 1,
                  opacity: 0,
                  pointerEvents: "none",
                }}
              />
            </DropdownMenuTrigger>
            {/* Offset to prevent dropdown from overlapping the trigger */}
            <DropdownMenuContent
              className="w-96"
              side="bottom"
              sideOffset={4}
              align="start"
              avoidCollisions={true}
              onInteractOutside={handleInteractOutside}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {knowledgeItems.map((item, index) => (
                <DropdownMenuItem
                  key={item.id}
                  icon={DocumentIcon}
                  label={item.label}
                  description={item.description}
                  truncateText
                  onClick={() => handleItemClick(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={
                    index === selectedIndex
                      ? "bg-gray-100 dark:bg-gray-800"
                      : ""
                  }
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </NodeViewWrapper>
  );
};
