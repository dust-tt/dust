import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { ActionButton } from "@app/components/Button";
import MainTab from "@app/components/use/MainTab";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions_registry";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { runActionStreamed } from "@app/lib/dust_api";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      readOnly: false,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppGens({
  user,
  owner,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [gen, setGen] = useState<string>("");

  const handleGenChange = (value: string) => {
    setGen(value);
  };

  const handleRefreshQuery = async () => {
    const config = cloneBaseConfig(DustProdActionRegistry["gens-query"].config);

    const context = {
      user: {
        username: user?.username,
        full_name: user?.name,
      },
      workspace: owner.name,
      date_today: new Date().toISOString().split("T")[0],
    };

    const res = await runActionStreamed(owner, "gens-query", config, [
      { text: gen, context },
    ]);
    if (res.isErr()) {
      window.alert("Error runing `gens-query`: " + res.error);
      return;
    }

    const { eventStream } = res.value;

    for await (const event of eventStream) {
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            console.log("Query refreshed", e.value);
            window.alert("Query refreshed: " + e.value);
          }
        }
      }
    }
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Gens" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl divide-y px-6">
            <div className="flex flex-col">
              <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex w-full font-normal">
                  <TextareaAutosize
                    minRows={8}
                    className={classNames(
                      "block w-full resize-none rounded-md bg-slate-100 px-2 py-1 font-mono text-[13px] font-normal",
                      readOnly
                        ? "border-gray-200 ring-0 focus:border-white focus:ring-0"
                        : "border-gray-200 focus:border-gray-300 focus:ring-0"
                    )}
                    readOnly={readOnly}
                    value={gen}
                    onChange={(e) => handleGenChange(e.target.value)}
                  />
                </div>
                <div className="flex-rows flex space-x-2">
                  <div className="mt-2 flex flex-initial">
                    <ActionButton
                      onClick={() => {
                        void handleRefreshQuery();
                      }}
                    >
                      Refresh Query
                    </ActionButton>
                  </div>
                  <div className="mt-2 flex flex-initial">
                    <ActionButton>Run Search</ActionButton>
                  </div>
                  <div className="mt-2 flex flex-initial">
                    <ActionButton>Generate</ActionButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
