import {
  Button,
  DocumentIcon,
  MagicIcon,
  Page,
  PencilSquareIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { AssistantTemplateModal } from "@app/components/assistant_builder/AssistantTemplateModal";
import { TemplateGrid } from "@app/components/assistant_builder/TemplateGrid";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppContentLayout, {
  appLayoutBack,
} from "@app/components/sparkle/AppContentLayout";
import AppHeadLayout from "@app/components/sparkle/AppHeadLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplates } from "@app/lib/swr/assistants";
import type {
  SubscriptionType,
  TemplateTagCodeType,
  TemplateTagsType,
  WorkspaceType,
} from "@app/types";
import { isTemplateTagCodeArray, TEMPLATES_TAGS_CONFIG } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  flow: BuilderFlow;
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
      flow,
      templateTagsMapping: TEMPLATES_TAGS_CONFIG,
    },
  };
});

export default function CreateAssistant({
  flow,
  owner,
  subscription,
  templateTagsMapping,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [templateSearchTerm, setTemplateSearchTerm] = useState<string | null>(
    null
  );
  const [selectedTags, setSelectedTags] = useState<TemplateTagCodeType[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    router.query.templateId ? (router.query.templateId as string) : null
  );

  const { assistantTemplates } = useAssistantTemplates();

  const [filteredTemplates, setFilteredTemplates] = useState<{
    templates: typeof assistantTemplates;
    tags: TemplateTagCodeType[];
  }>({ templates: [], tags: [] });

  const filterTemplates = useCallback(
    (searchTerm = templateSearchTerm) => {
      const templatesToDisplay = assistantTemplates.filter((template) => {
        // Check if template has valid tags
        if (!isTemplateTagCodeArray(template.tags)) {
          return false;
        }

        // Filter by selected tags (show templates that match ANY selected tag)
        if (
          selectedTags.length > 0 &&
          !selectedTags.some((tag) => template.tags.includes(tag))
        ) {
          return false;
        }

        // Filter by search term
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          return (
            template.handle.toLowerCase().includes(searchLower) ||
            template.description?.toLowerCase().includes(searchLower) ||
            false
          );
        }

        return true;
      });

      setFilteredTemplates({
        templates: templatesToDisplay,
        tags: _.uniq(
          assistantTemplates.map((template) => template.tags).flat()
        ),
      });
    },
    [assistantTemplates, selectedTags, templateSearchTerm]
  );

  useEffect(() => {
    filterTemplates();
  }, [assistantTemplates, filterTemplates, selectedTags]);

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
    filterTemplates(searchTerm);
  };

  const handleTagClick = (tagName: TemplateTagCodeType) => {
    setSelectedTags((prevTags) =>
      prevTags.includes(tagName)
        ? prevTags.filter((tag) => tag !== tagName)
        : [...prevTags, tagName]
    );
  };

  return (
    <AppContentLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={"Create an Agent"}
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
                <Button
                  icon={DocumentIcon}
                  label="New Agent"
                  data-gtm-label="assistantCreationButton"
                  data-gtm-location="assistantCreationPage"
                  size="md"
                  variant="highlight"
                />
              </Link>
            </div>
            <Page.Separator />

            <Page.Header title="Start from a template" icon={MagicIcon} />
            <div className="flex flex-col gap-6">
              <SearchInput
                placeholder="Search templates"
                name="input"
                value={templateSearchTerm}
                onChange={handleSearch}
              />
              <div className="flex flex-row flex-wrap gap-2">
                {filteredTemplates.tags
                  .sort((a, b) =>
                    a.toLowerCase().localeCompare(b.toLowerCase())
                  )
                  .map((tagName) => (
                    <Button
                      label={templateTagsMapping[tagName].label}
                      variant={
                        selectedTags.includes(tagName) ? "primary" : "outline"
                      }
                      key={tagName}
                      size="xs"
                      onClick={() => handleTagClick(tagName)}
                    />
                  ))}
              </div>
            </div>
            <Page.Separator />
            <div className="flex flex-col pb-56">
              <TemplateGrid
                templates={filteredTemplates.templates}
                openTemplateModal={openTemplateModal}
                templateTagsMapping={templateTagsMapping}
                selectedTags={selectedTags}
              />
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
    </AppContentLayout>
  );
}

CreateAssistant.getLayout = (page: React.ReactElement) => {
  return <AppHeadLayout>{page}</AppHeadLayout>;
};
