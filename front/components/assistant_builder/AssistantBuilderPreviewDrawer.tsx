import {
  ChatBubbleBottomCenterTextIcon,
  Tab,
  TemplateIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

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
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="pb-2 pt-4 text-5xl font-semibold text-element-900">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="pb-2 pt-4 text-4xl font-semibold text-element-900">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="pb-2 pt-4 text-2xl font-semibold text-element-900">
                {children}
              </h3>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-element-900">
                {children}
              </strong>
            ),
            ul: ({ children }) => (
              <ul className="list-disc py-2 pl-8 text-element-800 first:pt-0 last:pb-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal py-3 pl-8 text-element-800 first:pt-0 last:pb-0">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="py-2 text-element-800 first:pt-0 last:pb-0">
                {children}
              </li>
            ),
          }}
          className="pr-8 pt-4"
        >
          {template?.helpInstructions ?? ""}
        </ReactMarkdown>
      )}
    </div>
  );
}
