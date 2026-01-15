import {
  ActionExternalLinkIcon,
  ActionTrashIcon,
  Button,
  IconButton,
  Input,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import type { PatchProjectMetadataBodyType } from "@app/types/api/internal/spaces";

interface ProjectUrlsSectionProps {
  disabled?: boolean;
}

export function ProjectUrlsSection({ disabled }: ProjectUrlsSectionProps) {
  const { control } = useFormContext<PatchProjectMetadataBodyType>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "urls",
  });

  const [newUrlName, setNewUrlName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const handleAddUrl = useCallback(() => {
    if (!newUrlName.trim() || !newUrl.trim()) {
      return;
    }
    append({ name: newUrlName.trim(), url: newUrl.trim() });
    setNewUrlName("");
    setNewUrl("");
  }, [newUrlName, newUrl, append]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddUrl();
      }
    },
    [handleAddUrl]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          URLs
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Add relevant links for this project
        </p>
      </div>

      {fields.length > 0 && (
        <div className="flex flex-col gap-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <BaseFormFieldSection fieldName={`urls.${index}.name`}>
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    placeholder="URL name"
                    disabled={disabled}
                    className="w-48"
                    message={errorMessage}
                    messageStatus={errorMessage ? "error" : "default"}
                    onChange={onChange}
                    {...registerProps}
                  />
                )}
              </BaseFormFieldSection>

              <BaseFormFieldSection fieldName={`urls.${index}.url`}>
                {({ registerRef, registerProps, onChange, errorMessage }) => (
                  <Input
                    ref={registerRef}
                    type="url"
                    placeholder="URL"
                    disabled={disabled}
                    className="flex-1"
                    message={errorMessage}
                    messageStatus={errorMessage ? "error" : "default"}
                    onChange={onChange}
                    {...registerProps}
                  />
                )}
              </BaseFormFieldSection>

              <IconButton
                icon={ActionExternalLinkIcon}
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(field.url, "_blank", "noopener noreferrer");
                }}
                disabled={disabled ?? !field.url.trim()}
                tooltip="Open URL"
              />

              <IconButton
                icon={ActionTrashIcon}
                variant="outline"
                size="sm"
                onClick={() => remove(index)}
                disabled={disabled}
                tooltip="Remove URL"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Input
          placeholder="URL name (e.g. Documentation)"
          value={newUrlName}
          onChange={(e) => setNewUrlName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-48"
        />
        <Input
          placeholder="URL (e.g. example.com)"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          label="Add"
          onClick={handleAddUrl}
          disabled={!newUrlName.trim() || !newUrl.trim() || disabled}
        />
      </div>
    </div>
  );
}
