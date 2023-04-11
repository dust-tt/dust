import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { auth_user } from "@app/lib/auth";

const { URL, DUST_API, GA_TRACKING_ID = null } = process.env;

export default function Specification({
  authUser,
  owner,
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
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Specification"
            owner={owner}
            readOnly={readOnly}
          />
        </div>
        <div className="w-max-4xl mx-auto">
          <div className="flex flex-auto">
            <div className="my-8 flex flex-auto flex-col">
              <div className="whitespace-pre font-mono text-[13px] text-gray-700">
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
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value;

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

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
      session: auth.session(),
      authUser: auth.isAnonymous() ? null : auth.user(),
      owner: { username: context.query.user },
      readOnly,
      app: data.app,
      specification: data.specification,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
