import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card } from "@sparkle/components/Card";
import { Check, Key01, XClose } from "@sparkle/icons/v2-stroke";
import React from "react";

export interface PersonalAuthenticationCardProps {
  icon?: React.ComponentProps<typeof Avatar>["icon"];
  serviceName?: string;
  canRespond: boolean;
  triggeringUserName?: string;
  credentialInputs?: React.ReactNode;
  errorMessage?: string | null;
  isConnecting?: boolean;
  isResolving?: boolean;
  connectDisabled?: boolean;
  onDecline?: () => void;
  onConnect?: () => void;
}

export function PersonalAuthenticationCard({
  icon = Key01,
  serviceName,
  canRespond,
  triggeringUserName,
  credentialInputs,
  errorMessage,
  isConnecting = false,
  isResolving = false,
  connectDisabled = false,
  onDecline,
  onConnect,
}: PersonalAuthenticationCardProps) {
  const displayName = serviceName ?? "this service";

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex flex-col gap-4 shadow"
    >
      <div className="flex items-center gap-2">
        <Avatar icon={icon} size="sm" />
        <div className="heading-base min-w-0">Connect account</div>
      </div>

      <div className="text-base text-muted-foreground">
        {`Dust needs access to ${displayName} to complete this action.`}
      </div>
      <div className="text-base text-muted-foreground">
        {`Once connected, ${displayName} will remain connected for future requests.`}
      </div>

      {canRespond ? (
        <>
          {credentialInputs}
          {errorMessage && (
            <div className="text-sm font-medium text-warning-800">
              {errorMessage}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Waiting for{" "}
          <span className="font-semibold text-foreground">
            {triggeringUserName}
          </span>{" "}
          to connect their account.
        </div>
      )}

      {canRespond && onDecline && onConnect && (
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            label="Decline"
            icon={XClose}
            // A connection can get stuck, so users must be able to abandon it
            // while the connection request is still in flight.
            disabled={isResolving}
            onClick={onDecline}
          />
          <Button
            variant="highlight"
            label={`Connect ${serviceName ?? "account"}`}
            icon={Check}
            disabled={isConnecting || isResolving || connectDisabled}
            isLoading={isConnecting}
            onClick={onConnect}
          />
        </div>
      )}
    </Card>
  );
}
