import type { ProtectedRouteChildrenProps } from "@app/ui/components/auth/ProtectedRoute";
import { UserDropdownMenu } from "@app/ui/components/navigation/UserDropdownMenu";
import {
  BarHeader,
  Button,
  cn,
  DustLogo,
  Page,
  RocketIcon,
} from "@dust-tt/sparkle";
import { Link } from "react-router-dom";

export const SubscribePage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  return (
    <div>
      <BarHeader
        title=""
        tooltip=""
        rightActions={
          <div className="items-right flex flex-row space-x-1">
            <UserDropdownMenu user={user} handleLogout={handleLogout} />
          </div>
        }
      />
      <div
        className={cn(
          "flex h-screen flex-col p-4",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex max-w-[400px] flex-col items-center text-center">
            <Link to="https://dust.tt" target="_blank">
              <DustLogo className="h-8 w-36" />
            </Link>
          </div>
          <div className="max-w-[400px] text-center">
            <Page.H variant="h4">Almost there!</Page.H>
          </div>
          <div className="text-center text-lg">
            Subscribe to start using Dust agent from anywhere in your browser.
          </div>

          <div className="m-1 flex text-center">
            <Link to={`${user.dustDomain}/w/${workspace.sId}/subscribe`}>
              <Button
                icon={RocketIcon}
                variant="primary"
                label="Get started"
                onClick={() => {
                  window.open(
                    `${user.dustDomain}/w/${workspace.sId}/subscribe`,
                    "_blank"
                  );
                }}
                size="sm"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
