import { Button, Logo } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { makeEnterpriseConnectionInitiateLoginUrl } from "@app/lib/api/enterprise_connection";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  initiatedLoginUrl: string;
}>(async (context) => {
  const workspaceId = (context.query.workspaceId as string) ?? null;
  const returnTo = (context.query.returnTo as string) ?? null;

  if (!workspaceId) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      initiatedLoginUrl: makeEnterpriseConnectionInitiateLoginUrl(
        workspaceId,
        returnTo
      ),
    },
  };
});

export default function SsoEnforced({
  initiatedLoginUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div style={{ height: "10vh" }}></div>
          <div className="grid grid-cols-1">
            <div>
              <Logo className="h-[48px] w-[192px] px-1" />
            </div>
            <p className="mt-16 text-4xl font-semibold tracking-tighter text-primary-50 md:text-6xl">
              <span className="text-warning">Secure AI agent</span> <br />
              with your company’s knowledge
              <br />
            </p>
          </div>
          <div className="h-10"></div>
          <div>
            <p className="font-base mb-8 text-muted-foreground dark:text-muted-foreground-night">
              Access requires Single Sign-On (SSO) authentication. Use your SSO
              provider to sign in.{" "}
            </p>
            <Button
              variant="highlight"
              label="Connect with SSO"
              size="md"
              href={initiatedLoginUrl}
            />
          </div>
        </div>
      </main>
    </>
  );
}
