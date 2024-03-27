import {
  ArrowRightIcon,
  Button,
  DocumentIcon,
  FilterChips,
  Icon,
  Page,
  Searchbar,
  TemplateIcon,
  TemplateItem,
} from "@dust-tt/sparkle";
import type {
  AssistantTemplateTagNameType,
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { assistantTemplateTagNames } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import type { BuilderFlow } from "@app/components/assistant_builder/AssistantBuilder";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/AssistantBuilder";
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

  const { assistantTemplates } = useAssistantTemplates({
    workspaceId: owner.sId,
  });

  const [filteredItems, setFilteredItems] = useState<typeof assistantTemplates>(
    []
  );

  useEffect(() => {
    setFilteredItems(assistantTemplates);
  }, [assistantTemplates]);

  const handleSearch = (searchTerm: string) => {
    setTemplateSearchTerm(searchTerm);

    if (searchTerm === "") {
      setFilteredItems(assistantTemplates);
    }

    setFilteredItems(
      assistantTemplates.filter((template) =>
        subFilter(searchTerm.toLowerCase(), template.name.toLowerCase())
      )
    );
  };

  const defaultTag =
    router.asPath.split("#")[1] ?? assistantTemplateTagNames[0];

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
      <Page variant="modal">
        <div className="flex flex-col items-center gap-2.5 rounded-lg bg-structure-50 py-8">
          <Icon visual={DocumentIcon} size="lg" />
          <Link href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}`}>
            <Button icon={ArrowRightIcon} label="Start new" size="sm" />
          </Link>
        </div>
        <Page.Header title="Use a template" icon={TemplateIcon} />
        <div className="flex flex-col gap-4">
          <Searchbar
            placeholder="Search templates"
            name="input"
            value={templateSearchTerm}
            onChange={handleSearch}
          />
          <FilterChips
            filters={templateTags}
            onFilterClick={(filterName) => {
              void router.replace(`#${filterName}`);
            }}
            defaultFilter={defaultTag}
          />
        </div>
        <Page.Separator />
        <div className="flex flex-col gap-2">
          {templateTags.map((tagName) => {
            const templatesForTag = filteredItems.filter((item) =>
              item.tags.includes(tagName)
            );

            const cards = templatesForTag.map((t) => (
              <TemplateItem
                key={t.sId}
                description={t.description ?? ""}
                id={t.sId}
                name={t.name}
                visual={{
                  emoji: "🫶",
                  backgroundColor: "bg-red-100",
                }}
                // TODO: Open modal.
                onClick={() => console.log("click")}
              />
            ));

            return (
              <div key={`${tagName}-root`} id={tagName}>
                <Page.SectionHeader title={tagName} key={tagName} />
                <div className="grid grid-cols-2 gap-2" key={`${tagName}-grid`}>
                  {cards.length > 0 ? cards : <p>No matching templates...</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Page>
    </AppLayout>
  );
}
