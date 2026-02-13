import {
  AssistantCard,
  CardGrid,
  ContextItem,
  LargeAssistantCard,
} from "@dust-tt/sparkle";
import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type {
  TemplateTagCodeType,
  TemplateTagsType,
} from "@app/types/assistant/templates";

interface AgentTemplateGridProps {
  templates: AssistantTemplateListType[];
  openTemplateModal: (templateId: string) => void;
  templateTagsMapping: TemplateTagsType;
  selectedTags: TemplateTagCodeType[];
  hasCopilot: boolean;
  onTemplateClick: (templateId: string) => void;
}

export function AgentTemplateGrid({
  templates,
  openTemplateModal,
  templateTagsMapping,
  selectedTags,
  hasCopilot,
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
              {hasCopilot ? (
                <CardGrid>
                  {templatesForTag.map((template) => (
                    <AssistantCard
                      key={template.sId}
                      title={template.handle}
                      pictureUrl={template.pictureUrl}
                      description={template.userFacingDescription ?? ""}
                      onClick={() => onTemplateClick(template.sId)}
                      variant="secondary"
                    />
                  ))}
                </CardGrid>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {templatesForTag.map((template) => (
                    <LargeAssistantCard
                      key={template.sId}
                      title={template.handle}
                      pictureUrl={template.pictureUrl}
                      description={template.userFacingDescription ?? ""}
                      onClick={() => openTemplateModal(template.sId)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
        .filter(Boolean)}
    </div>
  );
}
