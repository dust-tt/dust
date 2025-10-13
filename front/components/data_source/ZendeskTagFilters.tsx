import {
  Button,
  ContextItem,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  XMarkIcon,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";

interface TagFilters {
  includedTags: string[];
  excludedTags: string[];
}

interface ZendeskTagFiltersProps {
  readOnly: boolean;
  isAdmin: boolean;
  title: string;
  description: string;
  tagFilters: TagFilters;
  addTag: (tag: string, type: "include" | "exclude") => Promise<void>;
  removeTag: (tag: string, type: "include" | "exclude") => Promise<void>;
  loading: boolean;
  placeholder?: string;
}

export function ZendeskTagFilters({
  readOnly,
  isAdmin,
  title,
  description,
  tagFilters,
  addTag,
  removeTag,
  loading,
  placeholder = "Enter tag name",
}: ZendeskTagFiltersProps) {
  const { isDark } = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"include" | "exclude">("exclude");

  const handleSave = async () => {
    if (!inputValue.trim()) {
      return;
    }

    await addTag(inputValue.trim(), activeTab);
    setInputValue("");
    setIsEditing(false);
  };

  const handleRemoveTag = async (tag: string, type: "include" | "exclude") => {
    await removeTag(tag, type);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setInputValue("");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  const includedTags = tagFilters.includedTags || [];
  const excludedTags = tagFilters.excludedTags || [];
  const hasIncludedTags = includedTags.length > 0;
  const hasExcludedTags = excludedTags.length > 0;
  const hasTags = hasIncludedTags || hasExcludedTags;

  const renderTagList = (
    tags: string[],
    type: "include" | "exclude",
    bgColor: string,
    textColor: string
  ) => (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag: string) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ${bgColor} ${textColor}`}
        >
          {tag}
          {!readOnly && isAdmin && (
            <button
              onClick={() => handleRemoveTag(tag, type)}
              disabled={loading}
              className="ml-1 hover:opacity-70 disabled:opacity-50"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <ContextItem
      title={title}
      visual={
        <ContextItem.Visual visual={isDark ? ZendeskWhiteLogo : ZendeskLogo} />
      }
      action={
        <div className="flex flex-col gap-2">
          {isEditing && (
            <>
              <div className="flex flex-col gap-2">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) =>
                    setActiveTab(value as "include" | "exclude")
                  }
                >
                  <TabsList>
                    <TabsTrigger value="include" label="Include Tags" />
                    <TabsTrigger value="exclude" label="Exclude Tags" />
                  </TabsList>
                </Tabs>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={readOnly || !isAdmin || loading}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    readOnly || !isAdmin || loading || !inputValue.trim()
                  }
                  label="Add"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={readOnly || !isAdmin || loading}
                  label="Cancel"
                />
              </div>
            </>
          )}
        </div>
      }
    >
      <ContextItem.Description>
        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <div className="mb-4 flex items-start justify-between gap-4">
            <p>{description}</p>
            {!isEditing && (
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={readOnly || !isAdmin || loading}
                label="Add Tags"
              />
            )}
          </div>

          {hasIncludedTags && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-200">
                Include Tags (sync only items with these tags):
              </p>
              {renderTagList(
                includedTags,
                "include",
                "bg-green-100 dark:bg-green-900",
                "text-green-800 dark:text-green-200"
              )}
            </div>
          )}

          {hasExcludedTags && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-200">
                Exclude Tags (don't sync items with these tags):
              </p>
              {renderTagList(
                excludedTags,
                "exclude",
                "bg-red-100 dark:bg-red-900",
                "text-red-800 dark:text-red-200"
              )}
            </div>
          )}

          {!hasTags && (
            <p className="mb-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
              No tag filters configured.
            </p>
          )}
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
}
