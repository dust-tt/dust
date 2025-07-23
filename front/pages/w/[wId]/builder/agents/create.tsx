import {
  Button,
  DocumentIcon,
  Icon,
  MagicIcon,
  Page,
  PencilSquareIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { AgentTemplateGrid } from "@app/components/agent_builder/AgentTemplateGrid";
import { AgentTemplateModal } from "@app/components/agent_builder/AgentTemplateModal";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import AppContentLayout, {
  appLayoutBack,
} from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
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

  const featureFlags = await getFeatureFlags(owner);
  if (
    !featureFlags.includes("agent_builder_v2") ||
    (await isRestrictedFromAgentCreation(owner))
  ) {
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

export default function CreateAgent({
  flow,
  owner,
  subscription,
  templateTagsMapping,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<TemplateTagCodeType[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    (router.query.templateId as string) ?? null
  );

  const { assistantTemplates } = useAssistantTemplates();

  const { filteredTemplates, availableTags } = useMemo(() => {
    const validTemplates = assistantTemplates.filter((template) =>
      isTemplateTagCodeArray(template.tags)
    );

    const filtered = validTemplates.filter((template) => {
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => template.tags.includes(tag))
      ) {
        return false;
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          template.handle.toLowerCase().includes(searchLower) ||
          template.description?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    const tags = getUniqueTemplateTags(validTemplates);

    return { filteredTemplates: filtered, availableTags: tags };
  }, [assistantTemplates, selectedTags, searchTerm]);

  const openTemplateModal = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    await router.replace(
      { pathname: router.pathname, query: { wId: owner.sId, templateId } },
      undefined,
      { shallow: true }
    );
  };

  const closeTemplateModal = async () => {
    setSelectedTemplateId(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { templateId, ...queryWithoutTemplate } = router.query;
    await router.replace(
      { pathname: router.pathname, query: queryWithoutTemplate },
      undefined,
      { shallow: true }
    );
  };

  const handleTagClick = (tagName: TemplateTagCodeType) => {
    setSelectedTags((prevTags) =>
      prevTags.includes(tagName)
        ? prevTags.filter((tag) => tag !== tagName)
        : [...prevTags, tagName]
    );
  };

  return (
    <AppContentLayout subscription={subscription} hideSidebar owner={owner}>
      <AppLayoutSimpleCloseTitle
        title="Create an Agent"
        onClose={async () => {
          await appLayoutBack(owner, router);
        }}
      />
      <div id="pageContent">
        <Page variant="modal">
          <div className="flex flex-col gap-6">
            <div className="flex min-h-[20vh] flex-col justify-end gap-6">
              <div className="flex flex-row items-center gap-2">
                <Icon
                  visual={PencilSquareIcon}
                  size="lg"
                  className="text-primary-400 dark:text-primary-500"
                />
                <Page.Header title="Start new" />
              </div>
              <Button
                icon={DocumentIcon}
                label="New Agent"
                data-gtm-label="assistantCreationButton"
                data-gtm-location="assistantCreationPage"
                size="md"
                variant="highlight"
                href={`/w/${owner.sId}/builder/agents/new`}
              />
            </div>

            <Page.Separator />

            <div className="flex flex-row items-center gap-2">
              <Icon
                visual={MagicIcon}
                size="lg"
                className="text-primary-400 dark:text-primary-500"
              />
              <Page.Header title="Start from a template" />
            </div>

            <div className="flex flex-col gap-6">
              <SearchInput
                placeholder="Search templates"
                name="input"
                value={searchTerm}
                onChange={setSearchTerm}
              />
              <div className="flex flex-row flex-wrap gap-2">
                {availableTags.map((tagName) => (
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
            {filteredTemplates.length > 0 && (
              <>
                <Page.Separator />
                <div className="flex flex-col pb-56">
                  <AgentTemplateGrid
                    templates={filteredTemplates}
                    openTemplateModal={openTemplateModal}
                    templateTagsMapping={templateTagsMapping}
                    selectedTags={selectedTags}
                  />
                </div>
              </>
            )}
          </div>
        </Page>
        <AgentTemplateModal
          flow={flow}
          owner={owner}
          templateId={selectedTemplateId}
          onClose={closeTemplateModal}
        />
      </div>
    </AppContentLayout>
  );
}

CreateAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
