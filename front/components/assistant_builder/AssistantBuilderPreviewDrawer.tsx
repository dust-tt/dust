import {
  ChatBubbleBottomCenterTextIcon,
  Markdown,
  Tab,
  TemplateIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useMemo, useState } from "react";

import {
  TryAssistant,
  usePreviewAssistant,
} from "@app/components/assistant/TryAssistant";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

export default function AssistantBuilderPreviewDrawer({
  template,
  owner,
  previewDrawerOpenedAt,
  builderState,
}: {
  template: FetchAssistantTemplateResponse | null;
  owner: WorkspaceType;
  previewDrawerOpenedAt: number | null;
  builderState: AssistantBuilderState;
}) {
  const [previewDrawerCurrentTab, setPreviewDrawerCurrentTab] = useState<
    "Preview" | "Template"
  >(template ? "Template" : "Preview");

  const previewDrawerTabs = useMemo(
    () => [
      {
        label: "Preview",
        current: previewDrawerCurrentTab === "Preview",
        onClick: () => {
          setPreviewDrawerCurrentTab("Preview");
        },
        icon: ChatBubbleBottomCenterTextIcon,
      },
      {
        label: "Template",
        current: previewDrawerCurrentTab === "Template",
        onClick: () => {
          setPreviewDrawerCurrentTab("Template");
        },
        icon: TemplateIcon,
      },
    ],
    [previewDrawerCurrentTab]
  );

  const {
    shouldAnimate: shouldAnimatePreviewDrawer,
    draftAssistant,
    isFading,
  } = usePreviewAssistant({ owner, builderState });

  return (
    <div className="h-full pb-5">
      {template ? (
        <Tab
          tabs={previewDrawerTabs}
          variant="default"
          className="hidden lg:flex"
        />
      ) : null}
      {previewDrawerCurrentTab === "Preview" ? (
        <div
          className={classNames(
            "flex h-full w-full overflow-hidden rounded-xl border border-structure-200 bg-structure-50 transition-all",
            shouldAnimatePreviewDrawer &&
              previewDrawerOpenedAt != null &&
              // Only animate the reload if the drawer has been open for at least 1 second.
              // This is to prevent the animation from triggering right after the drawer is opened.
              Date.now() - previewDrawerOpenedAt > 1000
              ? "animate-reload"
              : ""
          )}
        >
          <TryAssistant
            owner={owner}
            assistant={draftAssistant}
            conversationFading={isFading}
          />
        </div>
      ) : (
        <Markdown
          content={template?.helpInstructions ?? ""}
          className="pr-8 pt-4"
        />
      )}
    </div>
  );
}
