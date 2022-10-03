import AppLayout from "../../../../../components/app/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { ActionButton } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../../../../lib/utils";
import { Tab } from "@headlessui/react";

const { URL } = process.env;

export default function App({ app }) {
  const { data: session } = useSession();

  return (
    <AppLayout app={{ sId: app.sId, name: app.name }}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Datasets"
          />
        </div>
        <div className="flex flex-1">
          <div className="flex flex-col mx-4 my-3">
            <Link href={`/${session.user.username}/a/${app.sId}/datasets/new`}>
              <a>
                <ActionButton disabled={false}>
                  <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                  New Dataset
                </ActionButton>
              </a>
            </Link>
          </div>
          {/* Start by a simple list of datasets and a new button */}
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

  // TODO(spolu): allow public viewing of apps

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

  const res = await fetch(`${URL}/api/apps/${context.query.sId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: context.req.headers.cookie,
    },
  });
  const data = await res.json();

  return {
    props: { session, app: data.app },
  };
}
