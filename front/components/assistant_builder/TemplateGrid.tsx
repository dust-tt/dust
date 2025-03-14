import { ContextItem, LargeAssistantCard } from "@dust-tt/sparkle";
import _ from "lodash";

import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { TemplateTagCodeType, TemplateTagsType } from "@app/types";

interface TemplateGridProps {
  templates: AssistantTemplateListType[];
  openTemplateModal: (templateId: string) => void;
  templateTagsMapping: TemplateTagsType;
  selectedTags: TemplateTagCodeType[];
}

export function TemplateGrid({
  templates,
  openTemplateModal,
  templateTagsMapping,
  selectedTags,
}: TemplateGridProps) {
  if (!templates.length) {
    return null;
  }

  const tags =
    selectedTags.length > 0 ? selectedTags : getUniqueTags(templates);

  return (
    <div className="flex flex-col gap-6">
      {tags.map((tagName) => {
        const templatesForTag = templates.filter((template) =>
          template.tags.includes(tagName)
        );

        if (templatesForTag.length === 0) {
          return null;
        }

        return (
          <div key={tagName}>
            <ContextItem.SectionHeader
              title={templateTagsMapping[tagName].label}
              hasBorder={false}
            />
            <div className="grid grid-cols-2 gap-2">
              {templatesForTag.map((t) => (
                <LargeAssistantCard
                  key={t.sId}
                  title={t.handle}
                  pictureUrl={t.pictureUrl}
                  description={t.description ?? ""}
                  onClick={() => openTemplateModal(t.sId)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper function to get unique tags from templates
function getUniqueTags(
  templates: AssistantTemplateListType[]
): TemplateTagCodeType[] {
  return _.uniq(templates.flatMap((template) => template.tags)).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}
