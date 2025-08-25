import { Button, ContextItem, SlackLogo } from "@dust-tt/sparkle";

interface SlackConnectionProps {
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect?: () => void;
}

export function SlackConnection({
  isConnected,
  onConnect,
  onDisconnect,
}: SlackConnectionProps) {
  return (
    <ContextItem.List>
      <ContextItem
        title="Slack Bot"
        subElement="Connect your Slack workspace to automatically process channel messages"
        visual={<SlackLogo className="h-6 w-6" />}
        action={
          <div className="flex flex-row items-center gap-2">
            {isConnected && onDisconnect && (
              <Button
                variant="outline"
                label="Disconnect"
                size="xs"
                onClick={onDisconnect}
              />
            )}
            <Button
              variant={isConnected ? "outline" : "primary"}
              label={isConnected ? "Reconnect" : "Connect"}
              size="xs"
              onClick={onConnect}
            />
          </div>
        }
      />
    </ContextItem.List>
  );
}
