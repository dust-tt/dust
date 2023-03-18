import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";

const { URL, DUST_API, GA_TRACKING_ID = null } = process.env;

export default function Specification({
  user,
  readOnly,
  app,
  specification,
  ga_tracking_id,
}) {
  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Specification"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="mx-auto w-max-4xl">
          <div className="flex flex-auto">
            <div className="flex flex-auto flex-col my-8">
              <div className="whitespace-pre text-[13px] font-mono text-gray-700">
                {specification}
              </div>
            </div>
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

  const [specRes] = await Promise.all([
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/specification`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (specRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [data] = await Promise.all([specRes.json()]);

  return {
    props: {
      readOnly,
      user: context.query.user,
      app: data.app,
      specification: data.specification,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
