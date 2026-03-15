import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type {
  TemplateTagCodeType,
  TemplateTagsType,
} from "@app/types/assistant/templates";
import { CardGrid, CompactAssistantCard, ContextItem } from "@dust-tt/sparkle";

interface AgentTemplateGridProps {
  templates: AssistantTemplateListType[];
  openTemplateModal: (templateId: string) => void;
  templateTagsMapping: TemplateTagsType;
  selectedTags: TemplateTagCodeType[];
  hasSidekick: boolean;
  onTemplateClick: (templateId: string) => void;
}

export function AgentTemplateGrid({
  templates,
  openTemplateModal,
  templateTagsMapping,
  selectedTags,
  hasSidekick,
  onTemplateClick,
}: AgentTemplateGridProps) {
  if (!templates.length) {
    return null;
  }

  const tags =
    selectedTags.length > 0 ? selectedTags : getUniqueTemplateTags(templates);

  return (
    <div className="flex flex-col gap-6">
      {tags
        .map((tagName) => {
          const templatesForTag = templates.filter((template) =>
            template.tags.includes(tagName)
          );

          if (!templatesForTag.length) {
            return null;
          }

          return (
            <div key={tagName}>
              <ContextItem.SectionHeader
                title={templateTagsMapping[tagName].label}
                hasBorder={false}
              />
              <CardGrid>
                {templatesForTag.map((template) => (
                  <CompactAssistantCard
                    key={template.sId}
                    title={template.handle}
                    pictureUrl={template.pictureUrl}
                    description={template.userFacingDescription ?? ""}
                    onClick={() =>
                      hasSidekick
                        ? onTemplateClick(template.sId)
                        : openTemplateModal(template.sId)
                    }
                  />
                ))}
              </CardGrid>
            </div>
          );
        })
        .filter(Boolean)}
    </div>
  );
}
