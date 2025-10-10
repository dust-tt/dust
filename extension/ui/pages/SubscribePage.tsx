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
          <div className="flex flex-row items-right space-x-1">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="flex flex-col items-center text-center space-y-9 max-w-[400px]">
            <Link to="https://dust.tt" target="_blank">
              <DustLogo className="h-12 w-48" />
            </Link>
            <Page.SectionHeader title="Almost there" />
          </div>
          <div className="text-center">
            Subscribe to start using Dust agent from anywhere in your browser.
          </div>

          <div className="text-center gap-2 flex">
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
                size="md"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
