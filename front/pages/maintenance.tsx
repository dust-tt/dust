import { Button, Icon, LogoSquareColorLogo, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  code: string;
}>(async (context) => {
  return {
    props: {
      code: (context.query.code as string) ?? null,
    },
  };
});

const defaultErrorMessageClassName = "text-base font-normal text-slate-100";

function getErrorMessage(code: string) {
  switch (code) {
    case "relocation":
      return (
        <>
          <Page.Header
            title={<span className="text-white">Under Maintenance</span>}
          />
          <p className={defaultErrorMessageClassName}>
            We're currently performing a relocation of this workspace into
            another region.
          </p>
        </>
      );
    default:
      return (
        <>
          <Page.Header
            title={<span className="text-white">Under Maintenance</span>}
          />
          <p className={defaultErrorMessageClassName}>
            We're currently performing maintenance on this workspace.
            <br />
            Please check back in a few minutes.
          </p>
          <p className="text-sm font-normal italic text-slate-300">
            If this persists for an extended period,
            <br />
            please contact us at support@dust.tt
          </p>{" "}
        </>
      );
  }
}

export default function LoginError({
  code,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const errorMessage = getErrorMessage(code);

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
