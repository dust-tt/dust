import {
  Button,
  DustLogoSquare,
  Icon,
  LoginIcon,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  domain: string | null;
  reason: string | null;
}>(async (context) => {
  const reason =
    typeof context.query.reason === "string" ? context.query.reason : null;

  return {
    props: {
      domain: (context.query.domain as string) ?? null,
      reason,
    },
  };
});

const defaultErrorMessageClassName = "text-base text-primary-100";

function getErrorMessage(domain: string | null, reason: string | null) {
  const headerNode = (
    <Page.Header
      title={<span className="text-white">We couldn't log you in.</span>}
    />
  );

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (domain || reason === "invalid_domain") {
    return (
      <>
        {headerNode}
        <p className={defaultErrorMessageClassName}>
          The domain {domain ? `@${domain}` : ""} attached to your email address
          is not authorized to join this workspace.
          <br />
          Please contact your workspace admin to get access or contact us at
          support@dust.tt for assistance.
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
            Need more help? Email us at support@dust.tt.
          </p>
        </>
      );

    case "blacklisted_domain":
      // Deliberately shady message, to avoid frauders to know they are
      // blacklisted and try another domain
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            Unfortunately, we cannot provide access to Dust at this time.
            <br />
            Have a nice day.
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
            For your security, we need to verify your email address.
            <br />
            Check your inbox for a verification email.
          </p>
          <p className="text-sm font-normal italic text-primary-300">
            Not seeing it?
            <br />
            Check your spam folder.
          </p>

          <Button
            variant="outline"
            size="sm"
            label="Sign in"
            icon={LoginIcon}
            onClick={() => {
              window.location.href = `/api/workos/login?returnTo=/api/login`;
            }}
          />
        </>
      );

    case "invalid_invitation_token":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            The invitation is no longer valid.
            <br />
            To gain access, please ask your workspace administrator to add you
            or.
            <br />
            Need more help? Email us at support@dust.tt.
          </p>
        </>
      );

    case "invitation_token_email_mismatch":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            It looks like there's a mismatch between the invitation and the
            email address provided.
            <br />
            Please verify your email or contact your workspace administrator for
            assistance.
            <br />
            Need more help? Email us at support@dust.tt.
          </p>
        </>
      );

    case "revoked":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            Your access to the workspace has expired!
            <br />
            Contact your workspace administrator to update your role.
            <br />
            Need more help? Email us at support@dust.tt.
          </p>
        </>
      );

    default:
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            Please contact us at support@dust.tt for assistance.
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
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
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
