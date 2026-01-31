import {
  Button,
  CheckCircleIcon,
  ContentMessage,
  DocumentTextIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import type { FileAuthorizationInfo } from "@app/lib/actions/mcp";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType, UserType } from "@app/types";

interface GoogleDriveFileAuthorizationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  fileAuthorizationInfo: FileAuthorizationInfo;
  mcpServerId: string;
  retryHandler: () => void;
}

export function GoogleDriveFileAuthorizationRequired({
  triggeringUser,
  owner: _owner,
  fileAuthorizationInfo,
  mcpServerId: _mcpServerId,
  retryHandler: _retryHandler,
}: GoogleDriveFileAuthorizationRequiredProps) {
  const { user } = useUser();
  // TODO(#5954): setIsAuthorized will be called when picker integration is complete
  const [isAuthorized, _setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  const handleOpenPicker = async () => {
    setIsLoading(true);
    // TODO(#5954): Integrate with useGooglePicker hook
    // For now, placeholder that will be connected in the next ticket.
    // The picker will:
    // 1. Open with the connectionId from fileAuthorizationInfo
    // 2. Pre-select or highlight the file that needs authorization
    // 3. On successful authorization, call setIsAuthorized(true) and retryHandler()
    setIsLoading(false);
  };

  return (
    <ContentMessage
      title={isAuthorized ? "File authorized" : "Authorization required"}
      variant={isAuthorized ? "success" : "primary"}
      icon={isAuthorized ? CheckCircleIcon : DocumentTextIcon}
      className="flex w-80 min-w-[300px] flex-col gap-3 sm:min-w-[500px]"
    >
      {isTriggeredByCurrentUser ? (
        <>
          <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
            {isAuthorized ? (
              `${fileAuthorizationInfo.fileName} is now accessible. Continuing...`
            ) : (
              <>
                To access{" "}
                <span className="font-semibold">
                  {fileAuthorizationInfo.fileName}
                </span>
                , please authorize it once.
              </>
            )}
          </div>
          {!isAuthorized && (
            <div className="mt-3 flex flex-col justify-end sm:flex-row">
              <Button
                label={isLoading ? "Opening picker..." : "Open File Picker"}
                variant="highlight"
                size="xs"
                icon={DocumentTextIcon}
                disabled={isLoading}
                onClick={handleOpenPicker}
              />
            </div>
          )}
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          {triggeringUser?.fullName} needs to authorize a file.
          <br />
          <span className="font-semibold">Waiting for them to continue...</span>
        </div>
      )}
    </ContentMessage>
  );
}
