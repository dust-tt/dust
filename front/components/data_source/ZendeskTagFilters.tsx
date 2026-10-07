import {
  Button,
  ContextItem,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  XClose,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

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
  placeholder,
}: ZendeskTagFiltersProps) {
  const { t } = useLingui();
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
              <XClose className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <ContextItem
      title={title}
      visual={<ContextItem.Visual visual={ZendeskLogo} />}
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
                    <TabsTrigger value="include" label={t`Include tags`} />
                    <TabsTrigger value="exclude" label={t`Exclude tags`} />
                  </TabsList>
                </Tabs>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder ?? t`Enter tag name`}
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
                  label={t`Add`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={readOnly || !isAdmin || loading}
                  label={t`Cancel`}
                />
              </div>
            </>
          )}
        </div>
      }
    >
      <ContextItem.Description>
        <div className="text-muted-foreground">
          <div className="mb-4 flex items-start justify-between gap-4">
            <p>{description}</p>
            {!isEditing && (
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={readOnly || !isAdmin || loading}
                label={t`Add tags`}
              />
            )}
          </div>

          {hasIncludedTags && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-success-800">
                <Trans>Include tags (sync only items with these tags):</Trans>
              </p>
              {renderTagList(
                includedTags,
                "include",
                "bg-success-100",
                "text-success-800"
              )}
            </div>
          )}

          {hasExcludedTags && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-warning-800">
                <Trans>Exclude tags (don't sync items with these tags):</Trans>
              </p>
              {renderTagList(
                excludedTags,
                "exclude",
                "bg-warning-100",
                "text-warning-800"
              )}
            </div>
          )}

          {!hasTags && (
            <p className="mb-4 text-sm text-muted-foreground">
              <Trans>No tag filters configured.</Trans>
            </p>
          )}
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
}
