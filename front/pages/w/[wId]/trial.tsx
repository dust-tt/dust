import {
  Button,
  CheckIcon,
  DustLogoSquare,
  Icon,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
    },
  };
});

export default function Trial({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const skip = async () => {
    void router.push(`/w/${owner.sId}/subscribe`);
  };

  const startTrial = async () => {
    void router.push(`/w/${owner.sId}/verify`);
  };

  const features = [
    "Free 30-day trial",
    "Advanced models (GPT-5, Claude..)",
    "Custom agents which can execute actions",
    "Connections (GitHub, Google Drive, Notion, Slack...)",
    "Native integrations (Zendesk, Slack, Chrome Extension)",
    "100 free messages",
  ];

  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <Page.Header
              title="Start your free trial"
              icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
            />
            <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
              No credit card required
            </p>

            <ul className="flex flex-col gap-4">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Icon
                    visual={CheckIcon}
                    size="sm"
                    className="text-primary-500"
                  />
                  <span className="text-foreground dark:text-foreground-night">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-row gap-3">
              <Button
                onClick={startTrial}
                variant="primary"
                label="Start free trial"
              />
              <Button onClick={skip} variant="outline" label="Skip for now" />
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}
