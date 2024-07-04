import { AssistantPreview } from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import type { AssistantTemplateListType } from "@app/pages/api/w/[wId]/assistant/builder/templates";

interface TemplateGridProps {
  templates: AssistantTemplateListType[];
}

export function TemplateGrid({ templates }: TemplateGridProps) {
  const router = useRouter();

  const makeTemplateModalHref = (templateId: string) => {
    return {
      pathname: router.pathname,
      query: {
        ...router.query,
        templateId,
      },
    };
  };

  const items = templates.map((t) => (
    <AssistantPreview
      key={t.sId}
      title={t.handle}
      pictureUrl={t.pictureUrl}
      description={t.description ?? ""}
      variant="list"
      onClick={() => router.push(makeTemplateModalHref(t.sId))}
    />
  ));

  if (items.length === 0) {
    return null;
  }

  return <div className="grid grid-cols-2 gap-2">{items}</div>;
}
