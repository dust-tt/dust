import { AssistantCard, CardGrid } from "@dust-tt/sparkle";

import type { AssistantTemplateListType } from "@app/pages/api/w/[wId]/assistant/builder/templates";

interface TemplateGridProps {
  templates: AssistantTemplateListType[];
  openTemplateModal: (templateId: string) => void;
}

export function TemplateGrid({
  templates,
  openTemplateModal,
}: TemplateGridProps) {
  if (!templates.length) {
    return null;
  }
  return (
    <CardGrid>
      {templates.map((t) => (
        <AssistantCard
          key={t.sId}
          title={t.handle}
          pictureUrl={t.pictureUrl}
          description={t.description ?? ""}
          onClick={() => openTemplateModal(t.sId)}
        />
      ))}
    </CardGrid>
  );
}
