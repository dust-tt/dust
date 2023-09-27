import { Logo } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { signIn } from "next-auth/react";

import { GoogleSignInButton } from "@app/components/Button";
import { isWorkspaceAllowedOnDomain } from "@app/lib/api/workspace";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  wId: string;
  cId: string;
  gaTrackingId: string;
  baseUrl: string;
}> = async (context) => {
  const wId = context.query.wId as string;
  const cId = context.query.cId as string;

  if (!wId || !cId) {
    return {
      notFound: true,
    };
  }

  const isAllowedOnDomain = await isWorkspaceAllowedOnDomain(wId);
  if (!isAllowedOnDomain) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      wId: wId,
      cId: cId,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Join({
  wId,
  cId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />
      <main className="z-10 mx-6">
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div style={{ height: "10vh" }}></div>
          <div className="grid grid-cols-1">
            <div>
              <Logo className="h-[48px] w-[192px] px-1" />
            </div>
            <p className="mt-16 font-objektiv text-4xl font-bold tracking-tighter text-slate-50 md:text-6xl">
              <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                Secure AI assistant
              </span>{" "}
              <br />
              with your company’s knowledge
              <br />
            </p>
          </div>
          <div className="h-10"></div>
          <div>
            <p className="font-regular mb-16 text-slate-400">
              Glad to see you!
              <br />
              Please log in or sign up with your company email to access this
              page.
            </p>
            <GoogleSignInButton
              onClick={() =>
                signIn("google", {
                  callbackUrl: `/api/login?wId=${wId}&cId=${cId}&join=true`,
                })
              }
            >
              <img src="/static/google_white_32x32.png" className="h-4 w-4" />
              <span className="ml-2 mr-1">Sign in with Google</span>
            </GoogleSignInButton>
          </div>
        </div>
      </main>
    </>
  );
}
