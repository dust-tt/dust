import { Chip } from "@sparkle/components/Chip";
import { cn } from "@sparkle/lib/utils";
import React, { useState } from "react";

// Constants for consistent styling
const VALUE_CLASSES = "text-primary-700 pt-1 text-sm";
const EMPTY_CLASSES = "text-primary-500 pt-1 text-sm italic";
const INDENT_CLASSES = "border-structure-200 max-w-full border-l pl-4 ml-4";

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
        className="cursor-pointer font-medium text-highlight hover:underline"
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
          className="mb-2"
        />
        <div className={cn("max-w-full", isRootLevel && "ml-4")}>
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
    <div className={cn("flex items-start", isRootLevel ? "gap-3" : "gap-2")}>
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
      <div className="flex items-center gap-1">
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
        <span className={cn(VALUE_CLASSES, "whitespace-pre-wrap break-normal")}>
          {isExpanded ? value : value.substring(0, MAX_STRING_LENGTH)}
          {!isExpanded && "…"}{" "}
          <button
            onClick={() => handleToggleExpanded(longStringPath)}
            className="cursor-pointer font-medium text-highlight hover:underline"
          >
            {isExpanded
              ? "collapse"
              : `expand (${(value.length - MAX_STRING_LENGTH).toLocaleString()} more characters)`}
          </button>
        </span>
      );
    }

    return (
      <span className={cn(VALUE_CLASSES, "whitespace-pre-wrap break-normal")}>
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
      <div className="mt-2">
        {value.slice(0, itemsToShow).map((item, index) => (
          <div key={index} className={cn(INDENT_CLASSES)}>
            <div className="flex flex-col gap-2">
              <Chip size="xs" color="primary" label={`Item ${index + 1}`} />
              <div className="max-w-full">
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
        <div className="space-y-2">
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
      <div className="max-w-full space-y-3">
        {visibleEntries.map(([key, val]) => (
          <div
            key={key}
            className={cn(
              "max-w-full border-b pb-3 last:border-0 last:pb-0",
              "border-structure-200"
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
          <div className="border-structure-200 border-t pt-3">
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
    <span className={cn("text-sm", "text-element-700")}>{String(value)}</span>
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
  /** Parsed JSON value to display; objects, arrays, and primitives are all supported. */
  data: JsonValueType;
  className?: string;
}
/**
 * Human-friendly viewer for parsed JSON, rendering keys as chips and nesting
 * with indent guides, with expand/collapse for deep, long, or large values.
 * Used by CodeBlockWithExtendedSupport as the "Pretty JSON" view of fenced
 * JSON blocks in Markdown output.
 * @summary Pretty-printed JSON viewer.
 */
export function PrettyJsonViewer({ data, className }: JsonViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  return (
    <div
      className={cn(
        "max-w-full min-w-0 overflow-x-auto overflow-y-visible",
        "bg-structure-50",
        "rounded-lg px-4 py-4 text-base",
        className
      )}
    >
      <div className="max-w-full overflow-x-auto">
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
