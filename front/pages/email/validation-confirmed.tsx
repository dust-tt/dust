import { Button, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useState } from "react";

import config from "@app/lib/api/config";
import { useSearchParam } from "@app/lib/platform";

const REDIRECT_DELAY_SECONDS = 5;

type ValidationStatus =
  | "approved"
  | "rejected"
  | "expired"
  | "invalid"
  | "error"
  | "already_validated";

function getStatusContent(status: ValidationStatus | null) {
  switch (status) {
    case "approved":
      return {
        title: "Tool Approved",
        message: "The tool has been approved and will now execute.",
        color: "text-success-500",
      };
    case "rejected":
      return {
        title: "Tool Rejected",
        message: "The tool has been rejected and will not execute.",
        color: "text-warning-500",
      };
    case "expired":
      return {
        title: "Link Expired",
        message:
          "This approval link has expired. Please request a new validation email or approve the tool directly in Dust.",
        color: "text-warning-500",
      };
    case "invalid":
      return {
        title: "Invalid Link",
        message:
          "This approval link is invalid. Please check the link or request a new validation email.",
        color: "text-warning-500",
      };
    case "already_validated":
      return {
        title: "Already Validated",
        message: "This tool has already been approved or rejected.",
        color: "text-primary-400",
      };
    case "error":
    default:
      return {
        title: "Something Went Wrong",
        message:
          "An error occurred while processing your request. Please try again or contact support.",
        color: "text-warning-500",
      };
  }
}

export default function ValidationConfirmed() {
  const status = useSearchParam("status") as ValidationStatus | null;
  const conversationId = useSearchParam("conversationId");
  const workspaceId = useSearchParam("workspaceId");

  const [countdown, setCountdown] = useState(REDIRECT_DELAY_SECONDS);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const hasConversationLink = conversationId && workspaceId;
  const conversationUrl = hasConversationLink
    ? `${config.getAppUrl(true)}/w/${workspaceId}/conversation/${conversationId}`
    : null;

  useEffect(() => {
    if (!hasConversationLink) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setShouldRedirect(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasConversationLink]);

  useEffect(() => {
    if (shouldRedirect && conversationUrl) {
      window.location.href = conversationUrl;
    }
  }, [shouldRedirect, conversationUrl]);

  const { title, message, color } = getStatusContent(status);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-screen flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="flex flex-col items-center gap-4">
              <Page.Header title={<span className={color}>{title}</span>} />
              <p className="text-base text-primary-100">{message}</p>

              {hasConversationLink && (
                <p className="text-sm text-primary-300">
                  Redirecting to conversation in {countdown} seconds...
                </p>
              )}
            </div>

            <div className="flex gap-4">
              {conversationUrl && (
                <Link href={conversationUrl}>
                  <Button
                    variant="primary"
                    label="View Conversation"
                    size="sm"
                  />
                </Link>
              )}
              <Link href="/">
                <Button variant="outline" label="Back to Dust" size="sm" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
