import type { GooglePickerFile } from "@app/hooks/useGooglePicker";
import { useGooglePicker } from "@app/hooks/useGooglePicker";
import type { FileAuthorizationInfo } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import type { PickerTokenResponseType } from "@app/pages/api/w/[wId]/google_drive/picker_token";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  CheckCircleIcon,
  ContentMessage,
  DocumentTextIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

interface GoogleDriveFileAuthorizationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  fileAuthorizationInfo: FileAuthorizationInfo;
  mcpServerId: string;
  retryHandler: () => void;
}

export function GoogleDriveFileAuthorizationRequired({
  triggeringUser,
  owner,
  fileAuthorizationInfo,
  mcpServerId,
  retryHandler,
}: GoogleDriveFileAuthorizationRequiredProps) {
  const { user } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [pickerCredentials, setPickerCredentials] = useState<{
    accessToken: string;
    clientId: string;
    developerKey: string;
    appId: string;
  } | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  // Pre-fetch picker credentials on mount for faster picker opening
  useEffect(() => {
    if (!isTriggeredByCurrentUser || pickerCredentials) {
      return;
    }

    const fetchCredentials = async () => {
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/google_drive/picker_token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mcpServerId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch picker credentials");
        }

        const data: PickerTokenResponseType = await response.json();
        setPickerCredentials(data);
      } catch {
        setCredentialsError("Failed to load picker credentials");
      }
    };

    void fetchCredentials();
  }, [isTriggeredByCurrentUser, owner.sId, mcpServerId, pickerCredentials]);

  const handleFilesSelected = useCallback(
    (files: GooglePickerFile[]) => {
      // When user selects files in the picker, they authorize them via the drive.file scope.
      // Check if the file we needed was selected.
      const targetFileSelected = files.some(
        (file) => file.id === fileAuthorizationInfo.fileId
      );

      if (targetFileSelected) {
        setIsAuthorized(true);
        setTimeout(() => {
          retryHandler();
        }, 100);
      }
      // If wrong file selected, user can click the button again
    },
    [fileAuthorizationInfo.fileId, retryHandler]
  );

  const handlePickerCancel = useCallback(() => {
    setIsOpeningPicker(false);
  }, []);

  const { openPicker, isPickerLoaded, error } = useGooglePicker({
    clientId: pickerCredentials?.clientId ?? "",
    developerKey: pickerCredentials?.developerKey ?? "",
    accessToken: pickerCredentials?.accessToken ?? null,
    appId: pickerCredentials?.appId ?? "",
    fileId: fileAuthorizationInfo.fileId,
    onFilesSelected: handleFilesSelected,
    onCancel: handlePickerCancel,
  });

  // Open picker when user clicks and everything is ready
  useEffect(() => {
    if (pickerCredentials && isPickerLoaded && isOpeningPicker) {
      openPicker();
      setIsOpeningPicker(false);
    }
  }, [pickerCredentials, isPickerLoaded, isOpeningPicker, openPicker]);

  const handleOpenPicker = () => {
    if (isOpeningPicker) {
      return;
    }
    // Credentials are pre-fetched on mount, just trigger the picker opening
    setIsOpeningPicker(true);
  };

  const isReady = pickerCredentials && isPickerLoaded;
  const isButtonLoading = isOpeningPicker || (!isReady && !credentialsError);

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
              ` your file is now accessible. Continuing...`
            ) : (
              <>To access your file, please authorize it once.</>
            )}
          </div>
          {!isAuthorized && (
            <div className="mt-3 flex flex-col justify-end sm:flex-row">
              <Button
                label={isButtonLoading ? "Loading..." : "Open File Picker"}
                variant="highlight"
                size="xs"
                icon={DocumentTextIcon}
                disabled={isButtonLoading || !!error || !!credentialsError}
                onClick={handleOpenPicker}
              />
            </div>
          )}
          {(error ?? credentialsError) && (
            <div className="text-sm text-warning-500">
              {credentialsError ??
                "Failed to load file picker. Please try again."}
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
