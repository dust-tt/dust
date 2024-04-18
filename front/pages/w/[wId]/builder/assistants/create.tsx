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
  AssistantTemplateTagNameType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { assistantTemplateTagNames } from "@dust-tt/types";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { createRef, useEffect, useRef, useState } from "react";

import type { BuilderFlow } from "@app/components/assistant_builder/AssistantBuilder";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantTemplateModal } from "@app/components/assistant_builder/AssistantTemplateModal";
import { TemplateGrid } from "@app/components/assistant_builder/TemplateGrid";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplates } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  flow: BuilderFlow;
  gaTrackingId: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  templateTags: AssistantTemplateTagNameType[];
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
      templateTags: [...assistantTemplateTagNames],
    },
  };
});

export default function CreateAssistant({
  flow,
  gaTrackingId,
  owner,
  subscription,
  templateTags,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [templateSearchTerm, setTemplateSearchTerm] = useState<string | null>(
    null
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );

  const { assistantTemplates } = useAssistantTemplates({
    workspaceId: owner.sId,
  });

  const [filteredTemplates, setFilteredTemplates] = useState<{
    templates: typeof assistantTemplates;
    tags: AssistantTemplateTagNameType[];
  }>({ templates: [], tags: [] });

  useEffect(() => {
    setFilteredTemplates({
      templates: assistantTemplates,
      tags: _.uniq(assistantTemplates.map((template) => template.tags).flat()),
    });
  }, [assistantTemplates]);

  const handleSearch = (searchTerm: string) => {
    setTemplateSearchTerm(searchTerm);

    if (searchTerm === "") {
      setFilteredTemplates({
        templates: assistantTemplates,
        tags: _.uniq(
          assistantTemplates.map((template) => template.tags).flat()
        ),
      });
    } else {
      const filteredTemplates = assistantTemplates.filter((template) =>
        subFilter(searchTerm.toLowerCase(), template.handle.toLowerCase())
      );
      setFilteredTemplates({
        templates: filteredTemplates,
        tags: _.uniq(filteredTemplates.map((template) => template.tags).flat()),
      });
    }
  };

  const handleCloseModal = () => {
    const currentPathname = router.pathname;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { templateId, ...restQuery } = router.query;
    void router.replace(
      { pathname: currentPathname, query: restQuery },
      undefined,
      {
        shallow: true,
      }
    );
  };

  const tagsRefsMap = useRef<{
    [key: string]: React.MutableRefObject<HTMLDivElement | null>;
  }>({});

  useEffect(() => {
    templateTags.forEach((tag: string) => {
      tagsRefsMap.current[tag] = tagsRefsMap.current[tag] || createRef();
    });
  }, [templateTags]);

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

  useEffect(() => {
    const handleRouteChange = () => {
      const templateId = router.query.templateId ?? [];
      if (templateId && typeof templateId === "string") {
        setSelectedTemplateId(templateId);
      } else {
        setSelectedTemplateId(null);
      }
    };

    // Initial check in case the component mounts with the query already set.
    handleRouteChange();

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.query, router.events]);

  return (
    <AppLayout
      subscription={subscription}
      hideSidebar
      isWideMode
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
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
          <Page.Header title="Start new" icon={PencilSquareIcon} />
          <div className="pb-6">
            <Link href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}`}>
              <Button icon={DocumentIcon} label="New Assistant" size="md" />
            </Link>
          </div>
          <Page.Separator />
          <Page.Header title="Start from a template" icon={MagicIcon} />
          <div className="flex flex-col gap-4">
            <Searchbar
              placeholder="Search templates"
              name="input"
              value={templateSearchTerm}
              onChange={handleSearch}
              size="md"
            />
            <div className="flex flex-row flex-wrap gap-2">
              {filteredTemplates.tags.map((tagName) => (
                <Button
                  label={tagName}
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
            {filteredTemplates.tags.map((tagName) => {
              const templatesForTag = filteredTemplates.templates.filter(
                (item) => item.tags.includes(tagName)
              );
              return (
                <div key={tagName} ref={tagsRefsMap.current[tagName]}>
                  <ContextItem.SectionHeader
                    title={tagName}
                    hasBorder={false}
                  />
                  <TemplateGrid templates={templatesForTag} />
                </div>
              );
            })}
          </div>
        </Page>
        <AssistantTemplateModal
          flow={flow}
          owner={owner}
          templateId={selectedTemplateId}
          onClose={handleCloseModal}
        />
      </div>
    </AppLayout>
  );
}
