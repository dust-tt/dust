import {
  Button,
  Chip,
  DataTable,
  EyeIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  SearchInput,
} from "@dust-tt/sparkle";
import type {
  PlanType,
  SpaceType,
  SubscriptionType,
  TrackerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { capitalize } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useTrackers } from "@app/lib/swr/trackers";

type RowData = TrackerConfigurationType & {
  onClick: () => undefined;
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  baseUrl: string;
  isAdmin: boolean;
  owner: WorkspaceType;
  plan: PlanType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  if (!owner || !plan || !subscription || !auth.isUser() || !globalSpace) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      baseUrl: config.getClientFacingUrl(),
      isAdmin: auth.isAdmin(),
      owner,
      plan,
      subscription,
      globalSpace: globalSpace.toJSON(),
    },
  };
});

export default function TrackerConfigurations({
  owner,
  subscription,
  globalSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [filter, setFilter] = React.useState<string>("");

  const { trackers } = useTrackers({
    disabled: !owner,
    owner,
    space: globalSpace,
  });

  const rows = useMemo(
    () =>
      trackers.map((trackerConfiguration) => ({
        ...trackerConfiguration,
        onClick: () =>
          void router.push(
            `/w/${owner.sId}/assistant/labs/trackers/${trackerConfiguration.sId}`
          ),
      })),
    [trackers, owner, router]
  );

  const columns = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span>{info.row.original.name}</span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <Chip
            size="xs"
            color={info.row.original.status === "active" ? "emerald" : "slate"}
            className="capitalize"
          >
            {capitalize(info.row.original.status)}
          </Chip>
        </DataTable.CellContent>
      ),
    },
    {
      id: "edit",
      header: "",
      accessorKey: "id",
      cell: (info: CellContext<RowData, string>) => (
        <Button
          size="sm"
          variant="outline"
          icon={PencilSquareIcon}
          onClick={info.row.original.onClick}
        />
      ),
    },
  ];

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - Trackers"
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Trackers"
          icon={EyeIcon}
          description="Document monitoring made simple."
        />
        <Page.SectionHeader title="Watch Changes" />
        <Page.P>
          Select documents to monitor, define what matters to you, and receive
          notifications when relevant changes occur. <br />
          Set up once, stay informed automatically.
        </Page.P>
        <Page.SectionHeader title="Your Trackers" />
        <div className="w-full max-w-4xl overflow-x-auto">
          <div className="flex flex-row gap-2">
            <SearchInput
              name="filter"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e)}
            />
            <Button
              label="New tracker"
              icon={PlusIcon}
              onClick={() =>
                router.push(`/w/${owner.sId}/assistant/labs/trackers/new`)
              }
            />
          </div>

          <div className="h-8" />

          {rows.length > 0 && (
            <DataTable
              data={rows}
              filter={filter}
              filterColumn="name"
              columns={columns}
            />
          )}
        </div>
      </Page.Vertical>
    </AppLayout>
  );
}
