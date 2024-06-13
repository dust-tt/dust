import { Button, Icon, LogoSquareColorLogo, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  domain: string | null;
  gaTrackingId: string;
  reason: string | null;
}>(async (context) => {
  return {
    props: {
      domain: (context.query.domain as string) ?? null,
      gaTrackingId: GA_TRACKING_ID,
      reason: (context.query.reason as string) ?? null,
    },
  };
});

const defaultErrorMessageClassName = "text-base font-normal text-slate-100";

function getErrorMessage(domain: string | null, reason: string | null) {
  const headerNode = (
    <Page.Header
      title={<span className="text-white">We couldn't log you in.</span>}
    />
  );

  if (domain) {
    return (
      <>
        {headerNode}
        <p className={defaultErrorMessageClassName}>
          The domain @{domain} attached to your email address is not authorized
          to join this workspace.
          <br />
          Please contact your workspace admin to get access or contact us at
          team@dust.tt for assistance.
        </p>
      </>
    );
  }

  switch (reason) {
    case "unauthorized":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            Oops! Looks like you're not authorized to access this application
            yet.
            <br />
            To gain access, please ask your workspace administrator to add you
            or, your domain. <br />
            Need more help? Email us at team@dust.tt.
          </p>
        </>
      );

    case "email_not_verified":
      return (
        <>
          <Page.Header
            title={
              <span className="text-white">
                Keep an eye
                <br />
                on your inbox!
              </span>
            }
          />
          <p className={defaultErrorMessageClassName}>
            For you security, we need to verify your email address.
            <br />
            Check your inbox for a verification email.
          </p>
          <p className="text-sm font-normal italic text-slate-300">
            Not seeing it?
            <br />
            Check you spam folder.
          </p>
        </>
      );

    default:
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            Please contact us at team@dust.tt for assistance.
          </p>
        </>
      );
  }
}

export default function LoginError({
  domain,
  reason,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const errorMessage = getErrorMessage(domain, reason);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />
      <main className="z-10 mx-6">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={LogoSquareColorLogo} size="lg" />
            <div className="flex flex-col items-center gap-6">
              {errorMessage}
            </div>
            <Link href="/">
              <Button variant="primary" label="Back to homepage" size="sm" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
