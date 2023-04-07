import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { ActionButton } from "@app/components/Button";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import Link from "next/link";
import { classNames } from "@app/lib/utils";
import Router from "next/router";
import { auth_user } from "@app/lib/auth";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DatasetsView({
  authUser,
  owner,
  readOnly,
  app,
  datasets,
  ga_tracking_id,
}) {
  const handleDelete = async (datasetName) => {
    if (confirm("Are you sure you want to delete this dataset entirely?")) {
      const res = await fetch(
        `/api/apps/${owner.username}/${app.sId}/datasets/${datasetName}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();
      Router.push(`/${owner.username}/a/${app.sId}/datasets`);
    }
  };

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="leadingflex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Datasets"
            owner={owner}
            readOnly={readOnly}
          />
        </div>
        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="flex flex-1">
            <div className="mx-2 my-4 flex flex-auto flex-col sm:mx-4 lg:mx-8">
              <Link href={`/${owner.username}/a/${app.sId}/datasets/new`}>
                <ActionButton disabled={readOnly}>
                  <PlusIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                  New Dataset
                </ActionButton>
              </Link>

              <div className="mt-4">
                <ul role="list" className="flex-1 space-y-4">
                  {datasets.map((d) => {
                    return (
                      <Link
                        key={d.name}
                        href={`/${owner.username}/a/${app.sId}/datasets/${d.name}`}
                        className="block"
                      >
                        <div
                          key={d.name}
                          className="group rounded border border-gray-300 px-4 py-4"
                        >
                          <div className="flex items-center justify-between">
                            <p className="truncate text-base font-bold text-violet-600">
                              {d.name}
                            </p>
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-shrink-0">
                                <TrashIcon
                                  className="hidden h-4 w-4 text-gray-400 hover:text-red-700 group-hover:block"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDelete(d.name);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="mt-2 sm:flex sm:justify-between">
                            <div className="sm:flex">
                              <p
                                className={classNames(
                                  d.description
                                    ? "text-gray-700"
                                    : "text-gray-300",
                                  "flex items-center text-sm text-gray-700"
                                )}
                              >
                                {d.description
                                  ? d.description
                                  : "No description"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </ul>
                <div className="mt-2 max-w-4xl px-2">
                  <div className="py-2 text-sm text-gray-400">
                    Datasets are used as input data to apps (
                    <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                      input
                    </span>{" "}
                    block) or few-shot examples to prompt models (
                    <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                      data
                    </span>{" "}
                    block).
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

export async function getServerSideProps(context) {
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value();

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

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
    return { notFound: true };
  }

  const [app, datasets] = await Promise.all([
    appRes.json(),
    datasetsRes.json(),
  ]);

  return {
    props: {
      session: auth.session(),
      authUser: auth.isAnonymous() ? null : auth.user(),
      owner: { username: context.query.user },
      readOnly,
      app: app.app,
      datasets: datasets.datasets,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
