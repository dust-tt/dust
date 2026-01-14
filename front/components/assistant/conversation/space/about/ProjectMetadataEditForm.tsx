import {
  Button,
  Card,
  Input,
  PlusIcon,
  RadioGroup,
  RadioGroupItem,
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useUpdateProjectMetadata } from "@app/lib/swr/spaces";
import type {
  LightWorkspaceType,
  ProjectExternalLink,
  ProjectMetadataType,
  ProjectStatus,
  SpaceType,
} from "@app/types";

interface ProjectMetadataEditFormProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  projectMetadata: ProjectMetadataType | null;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
] as const;

export function ProjectMetadataEditForm({
  owner,
  space,
  projectMetadata,
  onClose,
}: ProjectMetadataEditFormProps) {
  const [status, setStatus] = useState<ProjectStatus>(
    projectMetadata?.status ?? "active"
  );
  const [description, setDescription] = useState(
    projectMetadata?.description ?? ""
  );
  const [tagsInput, setTagsInput] = useState(
    projectMetadata?.tags?.join(", ") ?? ""
  );
  const [externalLinks, setExternalLinks] = useState<ProjectExternalLink[]>(
    projectMetadata?.externalLinks ?? []
  );
  const [isSaving, setIsSaving] = useState(false);

  const doUpdate = useUpdateProjectMetadata({ owner, spaceId: space.sId });

  const handleSave = async () => {
    setIsSaving(true);

    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    await doUpdate({
      status,
      description: description.trim() || null,
      tags: tags.length > 0 ? tags : null,
      externalLinks: externalLinks.length > 0 ? externalLinks : null,
    });

    setIsSaving(false);
    onClose();
  };

  const handleAddLink = () => {
    setExternalLinks([...externalLinks, { title: "", url: "" }]);
  };

  const handleRemoveLink = (index: number) => {
    setExternalLinks(externalLinks.filter((_, i) => i !== index));
  };

  const handleUpdateLink = (
    index: number,
    field: "title" | "url",
    value: string
  ) => {
    const updated = [...externalLinks];
    updated[index] = { ...updated[index], [field]: value };
    setExternalLinks(updated);
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit Project Information</h3>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Status</label>
          <RadioGroup
            value={status}
            onValueChange={(value: string) => setStatus(value as ProjectStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <RadioGroupItem
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Description
          </label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of what this project is about..."
            rows={4}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Tags
            <span className="ml-1 text-xs text-muted-foreground">
              (comma-separated)
            </span>
          </label>
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. engineering, design, customer-facing"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              External Links
            </label>
            <Button
              variant="outline"
              label="Add Link"
              icon={PlusIcon}
              size="sm"
              onClick={handleAddLink}
            />
          </div>
          {externalLinks.length > 0 && (
            <div className="flex flex-col gap-3">
              {externalLinks.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex flex-1 gap-2">
                    <Input
                      value={link.title}
                      onChange={(e) =>
                        handleUpdateLink(index, "title", e.target.value)
                      }
                      placeholder="Link title"
                      className="flex-1"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        handleUpdateLink(index, "url", e.target.value)
                      }
                      placeholder="https://..."
                      className="flex-1"
                    />
                  </div>
                  <Button
                    variant="outline"
                    icon={TrashIcon}
                    size="sm"
                    onClick={() => handleRemoveLink(index)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" label="Cancel" onClick={onClose} />
        <Button
          variant="primary"
          label={isSaving ? "Saving..." : "Save"}
          onClick={handleSave}
          disabled={isSaving}
        />
      </div>
    </Card>
  );
}
