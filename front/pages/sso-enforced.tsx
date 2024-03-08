import { Button, Logo } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { makeEnterpriseConnectionInitiateLoginUrl } from "@app/lib/api/enterprise_connection";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  initiatedLoginUrl: string;
}>(async (context) => {
  const workspaceId = (context.query.workspaceId as string) ?? null;

  if (!workspaceId) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      initiatedLoginUrl: makeEnterpriseConnectionInitiateLoginUrl(workspaceId),
    },
  };
});

export default function SsoEnforced({
  initiatedLoginUrl,
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
            <p className="font-regular mb-8 text-slate-400">
              Access requires Single Sign-On (SSO) authentication. Use your SSO
              provider to sign in.{" "}
            </p>
            <Link href={initiatedLoginUrl}>
              <Button variant="primary" label="Connect with SSO" size="md" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
