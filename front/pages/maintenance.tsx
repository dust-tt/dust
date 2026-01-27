import { Button, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import type { RegionInfo } from "@app/lib/api/regions/config";
import { config } from "@app/lib/api/regions/config";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { isString } from "@app/types";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  code: string;
  otherRegion: RegionInfo;
}>(async (context) => {
  return {
    props: {
      code: isString(context.query.code) ? context.query.code : "",
      otherRegion: config.getOtherRegionInfo(),
    },
  };
});

const defaultErrorMessageClassName = "text-base text-primary-100";

interface MaintenancePageInfo {
  title: string;
  message: React.ReactNode;
  buttonLabel: string;
  buttonUrl: string;
}

function getMaintenancePageInfo(
  code: string,
  otherRegion: RegionInfo
): MaintenancePageInfo {
  switch (code) {
    case "relocation":
      return {
        title: "Service Relocation in Progress",
        message: (
          <>
            <p className={defaultErrorMessageClassName}>
              Your account is currently being relocated to a new region. During
              this planned migration, you won't be able to access our
              application. This temporary interruption ensures a smooth
              transition of your organization's data.
            </p>
            <h4 className="heading-xl text-white">What's happening?</h4>
            <p className={defaultErrorMessageClassName}>
              As discussed with your team, we're moving your account to a
              different regional infrastructure. All your data, settings, and
              configurations will remain exactly as they were. We'll notify your
              team once the relocation is complete and your access is restored.
            </p>
          </>
        ),
        buttonLabel: "Back to homepage",
        buttonUrl: "/",
      };

    case "relocation-done":
      return {
        title: "Service Relocation Complete",
        message: (
          <p className={defaultErrorMessageClassName}>
            Your account has been successfully relocated to a new region. You
            can now access our application.
          </p>
        ),
        buttonLabel: `Continue to ${otherRegion.name}`,
        buttonUrl: `${otherRegion.url}/`,
      };

    default:
      return {
        title: "Under Maintenance",
        message: (
          <>
            <p className={defaultErrorMessageClassName}>
              We're currently performing maintenance on this workspace.
              <br />
              Please check back in a few minutes.
            </p>
            <p className="text-sm italic text-primary-300">
              If this persists for an extended period,
              <br />
              please contact us at support@dust.tt
            </p>
          </>
        ),
        buttonLabel: "Back to homepage",
        buttonUrl: "/",
      };
  }
}

export default function MaintenancePage({
  code,
  otherRegion,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const maintenancePageInfo = getMaintenancePageInfo(code, otherRegion);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="mx-20 flex flex-col items-center gap-6">
              <Page.Header
                title={
                  <span className="text-white">
                    {maintenancePageInfo.title}
                  </span>
                }
              />
              {maintenancePageInfo.message}
            </div>
            <Link href={maintenancePageInfo.buttonUrl}>
              <Button
                variant="outline"
                label={maintenancePageInfo.buttonLabel}
                size="sm"
              />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
