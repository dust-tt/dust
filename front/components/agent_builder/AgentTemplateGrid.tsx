import {
  getUniqueTemplateTags,
  TEMPLATE_TAG_LABELS,
} from "@app/components/agent_builder/utils";
import type { AssistantTemplateListType } from "@app/lib/resources/template_resource";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import { CardGrid, CompactAssistantCard, ContextItem } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface AgentTemplateGridProps {
  templates: AssistantTemplateListType[];
  selectedTags: TemplateTagCodeType[];
  onTemplateClick: (templateId: string) => void;
}

export function AgentTemplateGrid({
  templates,
  selectedTags,
  onTemplateClick,
}: AgentTemplateGridProps) {
  const { t } = useLingui();

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
                title={t(TEMPLATE_TAG_LABELS[tagName])}
                hasBorder={false}
              />
              <CardGrid>
                {templatesForTag.map((template) => (
                  <CompactAssistantCard
                    key={template.sId}
                    title={template.handle}
                    pictureUrl={template.pictureUrl}
                    description={template.userFacingDescription ?? ""}
                    onClick={() => onTemplateClick(template.sId)}
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
