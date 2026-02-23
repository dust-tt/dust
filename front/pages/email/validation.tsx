// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import config from "@app/lib/api/config";
import { useSearchParam } from "@app/lib/platform";
import { Button, DustLogoSquare, Icon, Page, Spinner } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const VALIDATION_STATUSES = [
  "approved",
  "rejected",
  "expired",
  "invalid",
  "error",
  "already_validated",
] as const;

type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

function isValidationStatus(value: string): value is ValidationStatus {
  return VALIDATION_STATUSES.includes(value as ValidationStatus);
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Validation() {
  const token = useSearchParam("token");
  const rawStatus = useSearchParam("status");
  const conversationId = useSearchParam("conversationId");
  const workspaceId = useSearchParam("workspaceId");

  if (rawStatus) {
    const status: ValidationStatus = isValidationStatus(rawStatus)
      ? rawStatus
      : "error";
    return (
      <ResultView
        status={status}
        conversationId={conversationId}
        workspaceId={workspaceId}
      />
    );
  }

  if (token) {
    return <ConfirmView token={token} />;
  }

  return <ErrorView errorType="invalid" />;
}

/**
 * Auto-submit mode: renders a hidden form and submits it via JS on mount.
 * Prefetchers load the HTML but don't execute JS, so no side effects.
 * Real users see a brief "Processing..." flash before redirect.
 */
interface ConfirmViewProps {
  token: string;
}

function ConfirmView({ token }: ConfirmViewProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "Processing... - Dust";
  }, []);

  useEffect(() => {
    if (!submitted && formRef.current) {
      setSubmitted(true);
      formRef.current.submit();
    }
  }, [submitted]);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-screen flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="flex flex-col items-center gap-4">
              <Page.Header
                title={<span className="text-primary-100">Processing...</span>}
              />
              <Spinner size="xl" />
            </div>
          </div>
        </div>
      </main>
      {/* Hidden form auto-submitted by JS — prefetchers won't execute this. */}
      <form
        ref={formRef}
        method="POST"
        action="/api/email/validate-action"
        style={{ display: "none" }}
      >
        <input type="hidden" name="token" value={token} />
      </form>
    </>
  );
}

interface ResultViewProps {
  status: ValidationStatus;
  conversationId: string | null;
  workspaceId: string | null;
}

const AUTO_CLOSE_DELAY_SECONDS = 5;

function ResultView({ status, conversationId, workspaceId }: ResultViewProps) {
  const hasConversationLink = conversationId && workspaceId;
  const conversationUrl = hasConversationLink
    ? `${config.getAppUrl(true)}/w/${workspaceId}/conversation/${conversationId}`
    : null;

  const [countdown, setCountdown] = useState<number | null>(
    status === "approved" || status === "rejected"
      ? AUTO_CLOSE_DELAY_SECONDS
      : null
  );

  useEffect(() => {
    const titlePrefix =
      status === "approved"
        ? "Approved"
        : status === "rejected"
          ? "Rejected"
          : "Validation";
    document.title = `${titlePrefix} - Dust`;
  }, [status]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }
    if (countdown <= 0) {
      window.close();
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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
              {countdown !== null && (
                <p className="text-sm text-primary-400">
                  This page will close in {countdown}s.
                </p>
              )}
            </div>

            <div className="flex gap-4">
              {conversationUrl && (
                <a
                  href={conversationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="primary"
                    label="View Conversation"
                    size="sm"
                  />
                </a>
              )}
              <Button
                variant="outline"
                label="Close"
                size="sm"
                onClick={() => window.close()}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

interface ErrorViewProps {
  errorType: string;
}

function ErrorView({ errorType }: ErrorViewProps) {
  useEffect(() => {
    document.title = "Validation Error - Dust";
  }, []);

  const { title, message } = getErrorContent(errorType);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-screen flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="flex flex-col items-center gap-4">
              <Page.Header
                title={<span className="text-warning-500">{title}</span>}
              />
              <p className="text-base text-primary-100">{message}</p>
            </div>
            <Link href="/">
              <Button variant="outline" label="Back to Dust" size="sm" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function getErrorContent(errorType: string) {
  switch (errorType) {
    case "expired":
      return {
        title: "Link Expired",
        message:
          "This approval link has expired. Please request a new validation email or approve the tool directly in Dust.",
      };
    case "invalid":
      return {
        title: "Invalid Link",
        message:
          "This approval link is invalid. Please check the link or request a new validation email.",
      };
    default:
      return {
        title: "Something Went Wrong",
        message:
          "An error occurred while processing your request. Please try again or contact support.",
      };
  }
}

function getStatusContent(status: ValidationStatus) {
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
