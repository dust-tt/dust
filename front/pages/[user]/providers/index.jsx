import AppLayout from "../../../components/app/AppLayout";
import MainTab from "../../../components/profile/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";

const { URL } = process.env;

export default function ProfileProviders() {
  const { data: session } = useSession();

  return (
    <AppLayout>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="Providers" />
        </div>
        <div className="">
          <div className="mx-auto max-w-4xl px-4 divide-y divide-gray-200">
            <div className="sm:flex sm:items-center mt-12">
              <div className="sm:flex-auto mt-8">
                <h1 className="text-base font-medium text-gray-900">
                  Model Providers
                </h1>
                <p className="text-sm text-gray-500">
                  Model providers available to your apps. Activate at least one
                  to be able to run your apps against models.
                </p>
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

  return {
    props: { session },
  };
}
