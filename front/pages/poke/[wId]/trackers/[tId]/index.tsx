import { ContextItem, Page, Spinner, TextArea } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import PokeLayout from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { decodeSqids, formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeTracker } from "@app/poke/swr/trackers";
import type { WorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  trackerId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const { tId } = context.params || {};

  if (typeof tId !== "string") {
    return { notFound: true };
  }

  return {
    props: {
      owner,
      trackerId: tId,
    },
  };
});

export default function TrackerDetailPage({
  owner,
  trackerId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { isDark } = useTheme();
  const { data, isLoading, isError } = usePokeTracker({
    owner,
    tId: trackerId,
  });

  if (isLoading) {
    return <Spinner />;
  }

  if (isError || !data) {
    return <div>Error loading tracker</div>;
  }

  return (
    <div className="max-w-4xl">
      <Page.Vertical align="stretch">
        <ContextItem.List>
          <ContextItem title={`${data.name} (${data.sId})`} visual={<></>}>
            <ContextItem.Description>
              <div className="flex flex-col gap-2">
                <div className="ml-4 pt-2 text-sm text-muted-foreground">
                  <div className="font-bold">Created At:</div>
                  <div>{formatTimestampToFriendlyDate(data.createdAt)}</div>
                </div>
                <div className="ml-4 text-sm text-muted-foreground">
                  <div className="font-bold">Prompt:</div>
                  <TextArea value={data.prompt ?? ""} />
                </div>
                <div className="ml-4 pt-2 text-sm text-muted-foreground">
                  <div className="font-bold">Raw Data</div>
                  <JsonViewer
                    theme={isDark ? "dark" : "light"}
                    value={decodeSqids(data)}
                    defaultInspectDepth={0}
                  />
                </div>
              </div>
            </ContextItem.Description>
          </ContextItem>
        </ContextItem.List>
      </Page.Vertical>
    </div>
  );
}

TrackerDetailPage.getLayout = (
  page: ReactElement,
  { owner, trackerId }: { owner: WorkspaceType; trackerId: string }
) => {
  return <PokeLayout title={`${owner.name} - ${trackerId}`}>{page}</PokeLayout>;
};
