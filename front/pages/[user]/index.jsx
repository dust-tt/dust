import AppLayout from "../../components/app/AppLayout";
import { Button } from "../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../lib/utils";

const { URL } = process.env;

export default function Home({ apps }) {
  const { data: session } = useSession();

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 divide-y divide-gray-200 mt-8">
        <div>
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-base font-medium text-gray-900">Apps</h1>
              <p className="text-sm text-gray-500">
                All your apps live here. Create a new app to get started.
              </p>
            </div>
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              <Link href={`/${session.user.username}/new`}>
                <a>
                  <Button>
                    <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                    New App
                  </Button>
                </a>
              </Link>
            </div>
          </div>

          <div className="overflow-hidden bg-white mt-8">
            <ul role="list" className="">
              {apps.map((app) => (
                <li key={app.id}>
                  <div className="px-2 py-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/${session.user.username}/a/${app.sId}`}>
                        <a className="block">
                          <p className="truncate text-base font-bold text-violet-600">
                            {app.name}
                          </p>
                        </a>
                      </Link>
                      <div className="ml-2 flex flex-shrink-0">
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            app.visibility == "public"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          {app.visibility}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-700">
                          {app.description}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                        <p>{app.sId}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sm:flex sm:items-center mt-12">
          <div className="sm:flex-auto mt-8">
            <h1 className="text-base font-medium text-gray-900">
              Model Providers
            </h1>
            <p className="text-sm text-gray-500">
              Model providers available to your apps. Activate at least one to
              be able to run your apps against models.
            </p>
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

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const res = await fetch(`${URL}/api/apps`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: context.req.headers.cookie,
    },
  });
  const data = await res.json();

  return {
    props: { session, apps: data.apps },
  };
}
