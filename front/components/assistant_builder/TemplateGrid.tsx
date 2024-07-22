import { AssistantPreview } from "@dust-tt/sparkle";

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
    <div className="grid grid-cols-2 gap-2">
      {templates.map((t) => (
        <AssistantPreview
          key={t.sId}
          title={t.handle}
          pictureUrl={t.pictureUrl}
          description={t.description ?? ""}
          variant="list"
          onClick={() => openTemplateModal(t.sId)}
        />
      ))}
    </div>
  );
}
