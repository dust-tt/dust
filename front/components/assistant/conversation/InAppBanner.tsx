import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { GetActiveBroadcastResponseBody } from "@app/pages/api/broadcasts/active";

export function InAppBanner() {
  const [broadcast, setBroadcast] = useState<GetActiveBroadcastResponseBody["broadcast"]>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch active broadcast
    const fetchBroadcast = async () => {
      try {
        const response = await fetch("/api/broadcasts/active");
        if (response.ok) {
          const data: GetActiveBroadcastResponseBody = await response.json();
          setBroadcast(data.broadcast);
        }
      } catch (error) {
        console.error("Failed to fetch broadcast:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBroadcast();
  }, []);

  const onDismiss = async () => {
    if (!broadcast) return;

    setDismissed(true);

    // Send dismissal to backend
    try {
      await fetch(`/api/broadcasts/${broadcast.sId}/dismiss`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to dismiss broadcast:", error);
    }
  };

  const onLearnMore = () => {
    if (broadcast?.longDescription) {
      // TODO: Navigate to full broadcast view or modal
      window.open("/changelog", "_blank", "noopener,noreferrer");
    }
  };

  if (loading || !broadcast || dismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        "hidden flex-col sm:flex",
        "bg-background dark:bg-background-night",
        "rounded-2xl shadow-sm",
        "border border-border/0 dark:border-border-night/0",
        "mx-2 mb-2"
      )}
    >
      <div className="relative p-4">
        {broadcast.mediaUrl && broadcast.mediaType === "image" && (
          <img
            src={broadcast.mediaUrl}
            alt={broadcast.title}
            className="mb-3 max-h-48 w-full rounded-lg object-cover"
          />
        )}
        {broadcast.mediaUrl && broadcast.mediaType === "gif" && (
          <img
            src={broadcast.mediaUrl}
            alt={broadcast.title}
            className="mb-3 max-h-48 w-full rounded-lg object-contain"
          />
        )}
        {broadcast.mediaUrl && broadcast.mediaType === "video" && (
          <video
            src={broadcast.mediaUrl}
            className="mb-3 max-h-48 w-full rounded-lg"
            controls
            muted
            autoPlay
            loop
          />
        )}
        <div className="text-md mb-2 font-medium text-foreground dark:text-foreground-night">
          {broadcast.title}
        </div>
        <h4 className="mb-4 text-sm font-medium leading-tight text-primary dark:text-primary-night">
          {broadcast.shortDescription}
        </h4>
        {broadcast.longDescription && (
          <Button
            variant="highlight"
            size="xs"
            onClick={withTracking(
              TRACKING_AREAS.BROADCAST,
              "cta_broadcast_learn_more",
              onLearnMore
            )}
            label="Learn more"
          />
        )}
        <Button
          variant="ghost"
          icon={XMarkIcon}
          className="absolute right-1 top-1 opacity-50"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}
