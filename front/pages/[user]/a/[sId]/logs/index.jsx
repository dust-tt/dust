import AppLayout from "../../../../../components/app/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { ActionButton, Button } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../../../../lib/utils";
import Router from "next/router";
import { useState } from "react";

const { URL, GA_TRACKING_ID = null } = process.env;

const tabs = [
  { name: "Local", runType: "local" },
  { name: "API", runType: "deploy" },
];

export default function LogsView({ app, user, readOnly, ga_tracking_id }) {
  const { data: session } = useSession();

  const [runType, setRunType] = useState("local");

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="leadingflex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Runs"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="flex flex-1">
          <div className="flex flex-auto flex-col mx-2 sm:mx-4 lg:mx-8 my-4">
            <div className="flex flex-initial">
              <div className="hidden sm:block">
                <nav className="flex" aria-label="Tabs">
                  {tabs.map((tab, tabIdx) => (
                    <a
                      key={tab.name}
                      className={classNames(
                        tab.runType == runType
                          ? "border-gray-700 hover:bg-gray-800 bg-gray-700 text-white"
                          : "border-gray-300 text-gray-700 hover:text-gray-700",
                        tabIdx === 0 ? "rounded-l-md" : "",
                        tabIdx === tabs.length - 1 ? "rounded-r-md" : "",
                        "flex-1 py-1 px-3 text-sm border font-medium text-center hover:bg-gray-50 focus:z-10 cursor-pointer shadow-sm"
                      )}
                      aria-current={tab.current ? "page" : undefined}
                      onClick={() => setRunType(tab.runType)}
                    >
                      <div className="py-0.5">{tab.name}</div>
                    </a>
                  ))}
                </nav>
              </div>
            </div>

            <div className="mt-4"></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  let readOnly = !session || context.query.user !== session.user.username;

  const [appRes, datasetsRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.user}/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (appRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [app, datasets] = await Promise.all([
    appRes.json(),
    datasetsRes.json(),
  ]);

  return {
    props: {
      session,
      app: app.app,
      datasets: datasets.datasets,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
