import {
  Button,
  ContextItem,
  DocumentIcon,
  MagicIcon,
  Page,
  PencilSquareIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  SubscriptionType,
  TemplateTagCodeType,
  TemplateTagsType,
  WorkspaceType,
} from "@dust-tt/types";
import { isTemplateTagCodeArray, TEMPLATES_TAGS_CONFIG } from "@dust-tt/types";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { createRef, useCallback, useEffect, useRef, useState } from "react";

import { AssistantTemplateModal } from "@app/components/assistant_builder/AssistantTemplateModal";
import { TemplateGrid } from "@app/components/assistant_builder/TemplateGrid";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplates } from "@app/lib/swr";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  flow: BuilderFlow;
  gaTrackingId: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  templateTagsMapping: TemplateTagsType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
      flow,
      templateTagsMapping: TEMPLATES_TAGS_CONFIG,
    },
  };
});

export default function CreateAssistant({
  flow,
  gaTrackingId,
  owner,
  subscription,
  templateTagsMapping,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [templateSearchTerm, setTemplateSearchTerm] = useState<string | null>(
    null
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    router.query.templateId ? (router.query.templateId as string) : null
  );

  const { assistantTemplates } = useAssistantTemplates({
    workspaceId: owner.sId,
  });

  const [filteredTemplates, setFilteredTemplates] = useState<{
    templates: typeof assistantTemplates;
    tags: TemplateTagCodeType[];
  }>({ templates: [], tags: [] });

  useEffect(() => {
    const templatesToDisplay = assistantTemplates.filter((template) => {
      return isTemplateTagCodeArray(template.tags);
    });
    setFilteredTemplates({
      templates: templatesToDisplay,
      tags: _.uniq(templatesToDisplay.map((template) => template.tags).flat()),
    });
  }, [assistantTemplates]);

  const openTemplateModal = useCallback(
    async (templateId: string) => {
      setSelectedTemplateId(templateId);
      const wId = owner.sId;

      await router.replace(
        { pathname: router.pathname, query: { wId, templateId } },
        undefined,
        { shallow: true }
      );
    },
    [router, owner.sId]
  );

  const closeTemplateModal = useCallback(async () => {
    setSelectedTemplateId(null);
    await router.replace(
      { pathname: router.pathname, query: _.omit(router.query, "templateId") },
      undefined,
      { shallow: true }
    );
  }, [router]);

  const handleSearch = (searchTerm: string) => {
    setTemplateSearchTerm(searchTerm);
    const templatesFilteredFromSearch =
      searchTerm === ""
        ? assistantTemplates
        : assistantTemplates.filter(
            (template) =>
              template.handle
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
              template.description
                ?.toLowerCase()
                .includes(searchTerm.toLowerCase())
          );
    const templatesToDisplay = templatesFilteredFromSearch.filter(
      (template) => {
        return isTemplateTagCodeArray(template.tags);
      }
    );
    setFilteredTemplates({
      templates: templatesToDisplay,
      tags: _.uniq(templatesToDisplay.map((template) => template.tags).flat()),
    });
  };

  const tagsRefsMap = useRef<{
    [key: string]: React.MutableRefObject<HTMLDivElement | null>;
  }>({});

  useEffect(() => {
    Object.keys(templateTagsMapping).forEach((tag: string) => {
      tagsRefsMap.current[tag] = tagsRefsMap.current[tag] || createRef();
    });
  }, [templateTagsMapping]);

  const scrollToTag = (tagName: string) => {
    const SCROLL_OFFSET = 64; // Header size
    const scrollToElement = tagsRefsMap.current[tagName]?.current;
    const scrollContainerElement = document.getElementById("main-content");

    if (!scrollToElement || !scrollContainerElement) {
      return;
    }
    const scrollToElementRect = scrollToElement.getBoundingClientRect();
    const scrollContainerRect = scrollContainerElement.getBoundingClientRect();
    const scrollTargetPosition =
      scrollToElementRect.top -
      scrollContainerRect.top +
      scrollContainerElement.scrollTop -
      SCROLL_OFFSET;

    scrollContainerElement.scrollTo({
      top: scrollTargetPosition,
      behavior: "smooth",
    });

    setTimeout(() => {
      triggerShakeAnimation(scrollToElement);
    }, 1000);
  };

  const triggerShakeAnimation = (element: HTMLElement): void => {
    element.classList.add("animate-shake");
    setTimeout(() => {
      element.classList.remove("animate-shake");
    }, 500);
  };

  return (
    <AppLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      gaTrackingId={gaTrackingId}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={"Create an Assistant"}
          onClose={async () => {
            await appLayoutBack(owner, router);
          }}
        />
      }
    >
      <div id="pageContent">
        <Page variant="modal">
          <div className="flex flex-col gap-6 pt-9">
            <div className="flex min-h-[20vh] flex-col justify-end gap-6">
              <Page.Header title="Start new" icon={PencilSquareIcon} />
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}`}
              >
                <Button icon={DocumentIcon} label="New Assistant" size="md" />
              </Link>
            </div>
            <Page.Separator />

            <Page.Header title="Start from a template" icon={MagicIcon} />
            <div className="flex flex-col gap-6">
              <Searchbar
                placeholder="Search templates"
                name="input"
                value={templateSearchTerm}
                onChange={handleSearch}
                size="md"
              />
              <div className="flex flex-row flex-wrap gap-2">
                {filteredTemplates.tags
                  .sort((a, b) =>
                    a.toLowerCase().localeCompare(b.toLowerCase())
                  )
                  .map((tagName) => (
                    <Button
                      label={templateTagsMapping[tagName].label}
                      variant="tertiary"
                      key={tagName}
                      size="xs"
                      hasMagnifying={false}
                      onClick={() => scrollToTag(tagName)}
                    />
                  ))}
              </div>
            </div>
            <Page.Separator />
            <div className="flex flex-col pb-56">
              {templateSearchTerm?.length ? (
                <>
                  <TemplateGrid
                    templates={filteredTemplates.templates}
                    openTemplateModal={openTemplateModal}
                  />
                </>
              ) : (
                <>
                  {filteredTemplates.tags.map((tagName) => {
                    const templatesForTag = filteredTemplates.templates.filter(
                      (item) => item.tags.includes(tagName)
                    );
                    return (
                      <div key={tagName} ref={tagsRefsMap.current[tagName]}>
                        <ContextItem.SectionHeader
                          title={templateTagsMapping[tagName].label}
                          hasBorder={false}
                        />
                        <TemplateGrid
                          templates={templatesForTag}
                          openTemplateModal={openTemplateModal}
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </Page>
        <AssistantTemplateModal
          flow={flow}
          owner={owner}
          templateId={selectedTemplateId}
          onClose={() => closeTemplateModal()}
        />
      </div>
    </AppLayout>
  );
}
