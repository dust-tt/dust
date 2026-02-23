import React, { useState } from "react";

import { Chip } from "@sparkle/components/Chip";
import { cn } from "@sparkle/lib/utils";

// Constants for consistent styling
const VALUE_CLASSES =
  "s-text-primary-700 dark:s-text-primary-700-night s-pt-1 s-text-sm";
const EMPTY_CLASSES =
  "s-text-primary-500 dark:s-text-primary-500-night s-pt-1 s-text-sm s-italic";
const INDENT_CLASSES =
  "s-border-structure-200 dark:s-border-structure-200-night s-max-w-full s-border-l s-pl-4 s-ml-4";

// Performance limits to prevent browser crashes.
// These limits are meant to be very conservative.
const MAX_OBJECT_DEPTH = 8;
const MAX_ARRAY_ITEMS = 128;
const MAX_OBJECT_KEYS = 64;
const MAX_STRING_LENGTH = 1024;

export type JsonValueType =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValueType[]
  | { [key: string]: JsonValueType };

// Helper component for inline expand/collapse buttons with consistent styling.
function InlineExpandButton({
  label,
  buttonText,
  onClick,
  className,
}: {
  label: string;
  buttonText: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <span className={cn(EMPTY_CLASSES, className)}>
      {label}{" "}
      <button
        onClick={onClick}
        className="s-cursor-pointer s-font-medium s-text-highlight hover:s-underline dark:s-text-highlight-night"
      >
        {buttonText}
      </button>
    </span>
  );
}

// Helper component for rendering key-value pairs with consistent styling.
function KeyValuePair({
  keyName,
  value,
  depth,
  chipColor,
  isRootLevel = false,
  expandedPaths,
  setExpandedPaths,
  currentPath,
}: {
  keyName: string;
  value: JsonValueType;
  depth: number;
  chipColor: "info" | "highlight";
  isRootLevel?: boolean;
  expandedPaths?: Set<string>;
  setExpandedPaths?: React.Dispatch<React.SetStateAction<Set<string>>>;
  currentPath?: string;
}) {
  const isComplexValue = typeof value === "object" && value !== null;

  if (isComplexValue) {
    return (
      <>
        <Chip
          size="xs"
          color={chipColor}
          label={formatKey(keyName)}
          className="s-mb-2"
        />
        <div className={cn("s-max-w-full", isRootLevel && "s-ml-4")}>
          <JsonValue
            value={value}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            setExpandedPaths={setExpandedPaths}
            currentPath={`${currentPath}.${keyName}`}
          />
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "s-flex s-items-start",
        isRootLevel ? "s-gap-3" : "s-gap-2"
      )}
    >
      <Chip size="xs" color={chipColor} label={formatKey(keyName)} />
      <JsonValue
        value={value}
        depth={depth + 1}
        expandedPaths={expandedPaths}
        setExpandedPaths={setExpandedPaths}
        currentPath={`${currentPath}.${keyName}`}
      />
    </div>
  );
}

function JsonValue({
  value,
  depth = 0,
  expandedPaths = new Set(),
  setExpandedPaths,
  currentPath = "",
}: {
  value: JsonValueType;
  depth?: number;
  expandedPaths?: Set<string>;
  setExpandedPaths?: React.Dispatch<React.SetStateAction<Set<string>>>;
  currentPath?: string;
}) {
  const handleToggleExpanded = (path: string) => {
    if (!setExpandedPaths) {
      return;
    }

    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };
  if (
    depth >= MAX_OBJECT_DEPTH &&
    typeof value === "object" &&
    value !== null
  ) {
    const deepObjectPath = `${currentPath}:deep`;
    const isExpanded = expandedPaths?.has(deepObjectPath) ?? false;

    if (isExpanded) {
      // Render the full object/array when expanded, ignoring depth limit.
      return (
        <JsonValue
          value={value}
          depth={0} // Reset depth to allow full rendering.
          expandedPaths={expandedPaths}
          setExpandedPaths={setExpandedPaths}
          currentPath={`${currentPath}:expanded`}
        />
      );
    }

    return (
      <div className="s-flex s-items-center s-gap-1">
        <InlineExpandButton
          label="Maximum depth reached"
          buttonText="expand"
          onClick={() => handleToggleExpanded(deepObjectPath)}
        />
      </div>
    );
  }

  if (value === null || value === undefined) {
    return <span className={EMPTY_CLASSES}>empty</span>;
  }

  if (typeof value === "boolean") {
    return <span className={VALUE_CLASSES}>{value ? "Yes" : "No"}</span>;
  }

  if (typeof value === "number") {
    return <span className={VALUE_CLASSES}>{value}</span>;
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      const longStringPath = `${currentPath}:longstring`;
      const isExpanded = expandedPaths?.has(longStringPath) ?? false;

      return (
        <span
          className={`${VALUE_CLASSES} s-whitespace-pre-wrap s-break-normal`}
        >
          {isExpanded ? value : value.substring(0, MAX_STRING_LENGTH)}
          {!isExpanded && "…"}{" "}
          <button
            onClick={() => handleToggleExpanded(longStringPath)}
            className="s-cursor-pointer s-font-medium s-text-highlight hover:s-underline dark:s-text-highlight-night"
          >
            {isExpanded
              ? "collapse"
              : `expand (${(value.length - MAX_STRING_LENGTH).toLocaleString()} more characters)`}
          </button>
        </span>
      );
    }

    return (
      <span className={`${VALUE_CLASSES} s-whitespace-pre-wrap s-break-normal`}>
        {value}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className={EMPTY_CLASSES}>empty list</span>;
    }

    // Check if it's a simple array of primitives.
    const isSimpleArray = value.every(
      (item) => typeof item !== "object" || item === null
    );

    if (isSimpleArray && value.length <= 5) {
      return (
        <span className={VALUE_CLASSES}>
          {value.map((item, index) => (
            <span key={index}>
              <JsonValue
                value={item}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                setExpandedPaths={setExpandedPaths}
                currentPath={`${currentPath}[${index}]`}
              />
              {index < value.length - 1 && ", "}
            </span>
          ))}
        </span>
      );
    }

    // Truncate arrays that have too many items.
    const arrayPath = `${currentPath}[]`;
    const isExpanded = expandedPaths?.has(arrayPath) ?? false;
    const itemsToShow = isExpanded
      ? value.length
      : Math.min(value.length, MAX_ARRAY_ITEMS);
    const hasMore = value.length > MAX_ARRAY_ITEMS && !isExpanded;

    return (
      <div className="s-mt-2">
        {value.slice(0, itemsToShow).map((item, index) => (
          <div key={index} className={cn(INDENT_CLASSES)}>
            <div className="s-flex s-flex-col s-gap-2">
              <Chip size="xs" color="primary" label={`Item ${index + 1}`} />
              <div className="s-max-w-full">
                <JsonValue
                  value={item}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  currentPath={`${currentPath}[${index}]`}
                />
              </div>
            </div>
          </div>
        ))}
        {hasMore && (
          <div className={cn(INDENT_CLASSES)}>
            <InlineExpandButton
              label={`${value.length - itemsToShow} more items`}
              buttonText="expand"
              onClick={() => handleToggleExpanded(arrayPath)}
            />
          </div>
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className={EMPTY_CLASSES}>empty</span>;
    }

    // Truncate objects with too many properties.
    const objectPath = `${currentPath}{}`;
    const isExpanded = expandedPaths?.has(objectPath) ?? false;
    const keysToShow = isExpanded
      ? entries.length
      : Math.min(entries.length, MAX_OBJECT_KEYS);
    const hasMore = entries.length > MAX_OBJECT_KEYS && !isExpanded;
    const visibleEntries = entries.slice(0, keysToShow);

    // For nested objects, use a card-like layout with vertical bars.
    if (depth > 0) {
      return (
        <div className="s-space-y-2">
          {visibleEntries.map(([key, val]) => (
            <div key={key} className={cn(INDENT_CLASSES)}>
              <KeyValuePair
                keyName={key}
                value={val}
                depth={depth}
                chipColor="info"
                expandedPaths={expandedPaths}
                setExpandedPaths={setExpandedPaths}
                currentPath={currentPath}
              />
            </div>
          ))}
          {hasMore && (
            <div className={cn(INDENT_CLASSES)}>
              <InlineExpandButton
                label={`${entries.length - keysToShow} more properties`}
                buttonText="expand"
                onClick={() => handleToggleExpanded(objectPath)}
              />
            </div>
          )}
        </div>
      );
    }

    // Root level objects use a table-like layout.
    return (
      <div className="s-max-w-full s-space-y-3">
        {visibleEntries.map(([key, val]) => (
          <div
            key={key}
            className={cn(
              "s-max-w-full s-border-b s-pb-3 last:s-border-0 last:s-pb-0",
              "s-border-structure-200 dark:s-border-structure-200-night"
            )}
          >
            <KeyValuePair
              keyName={key}
              value={val}
              depth={depth}
              chipColor="highlight"
              isRootLevel
              expandedPaths={expandedPaths}
              setExpandedPaths={setExpandedPaths}
              currentPath={currentPath}
            />
          </div>
        ))}
        {hasMore && (
          <div className="s-border-structure-200 dark:s-border-structure-200-night s-border-t s-pt-3">
            <InlineExpandButton
              label={`${entries.length - keysToShow} more properties`}
              buttonText="expand"
              onClick={() => handleToggleExpanded(objectPath)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "s-text-sm",
        "s-text-element-700 dark:s-text-element-700-night"
      )}
    >
      {String(value)}
    </span>
  );
}

function formatKey(key: string): string {
  // Convert snake_case or camelCase to Title Case.
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface JsonViewerProps {
  data: JsonValueType;
  className?: string;
}
export function PrettyJsonViewer({ data, className }: JsonViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  return (
    <div
      className={cn(
        "s-bg-structure-50 dark:s-bg-structure-50-night",
        "s-overflow-hidden s-rounded-lg s-px-4 s-py-4 s-text-base",
        className
      )}
    >
      <div className="s-max-w-full s-overflow-x-auto">
        <JsonValue
          value={data}
          expandedPaths={expandedPaths}
          setExpandedPaths={setExpandedPaths}
          currentPath="root"
        />
      </div>
    </div>
  );
}
