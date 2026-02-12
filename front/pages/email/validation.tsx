import { Button, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import config from "@app/lib/api/config";
import { verifyValidationToken } from "@app/lib/api/email/validation_token";

const REDIRECT_DELAY_SECONDS = 5;

type ValidationStatus =
  | "approved"
  | "rejected"
  | "expired"
  | "invalid"
  | "error"
  | "already_validated";

/**
 * Two modes:
 * - "confirm": token present, auto-submits POST to validate-action API
 * - "result": status present, shows outcome
 */
type ValidationPageProps =
  | {
      mode: "confirm";
      token: string;
      approvalState: "approved" | "rejected";
    }
  | {
      mode: "result";
      status: ValidationStatus;
      conversationId: string | null;
      workspaceId: string | null;
    }
  | {
      mode: "error";
      errorType: "expired" | "invalid" | "error";
    };

export const getServerSideProps: GetServerSideProps<
  ValidationPageProps
> = async (context) => {
  const { token, status, conversationId, workspaceId } = context.query;

  // Result mode: status query param present (redirected from POST handler).
  if (typeof status === "string") {
    return {
      props: {
        mode: "result",
        status: status as ValidationStatus,
        conversationId:
          typeof conversationId === "string" ? conversationId : null,
        workspaceId: typeof workspaceId === "string" ? workspaceId : null,
      },
    };
  }

  // Confirm mode: token present, verify it server-side.
  if (typeof token === "string") {
    const tokenResult = verifyValidationToken(token);
    if (tokenResult.isErr()) {
      const errorType = tokenResult.error.type;
      return {
        props: {
          mode: "error",
          errorType:
            errorType === "expired"
              ? "expired"
              : errorType === "invalid_signature"
                ? "invalid"
                : "error",
        },
      };
    }

    return {
      props: {
        mode: "confirm",
        token,
        approvalState: tokenResult.value.approvalState,
      },
    };
  }

  // No token or status — invalid access.
  return {
    props: {
      mode: "error",
      errorType: "invalid",
    },
  };
};

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

export default function Validation(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.mode === "confirm") {
    return (
      <ConfirmView token={props.token} approvalState={props.approvalState} />
    );
  }
  if (props.mode === "result") {
    return (
      <ResultView
        status={props.status}
        conversationId={props.conversationId}
        workspaceId={props.workspaceId}
      />
    );
  }
  return <ErrorView errorType={props.errorType} />;
}

/**
 * Auto-submit mode: renders a hidden form and submits it via JS on mount.
 * Prefetchers load the HTML but don't execute JS, so no side effects.
 * Real users see a brief "Processing..." flash before redirect.
 */
interface ConfirmViewProps {
  token: string;
  approvalState: "approved" | "rejected";
}

function ConfirmView({ token, approvalState }: ConfirmViewProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!submitted && formRef.current) {
      setSubmitted(true);
      formRef.current.submit();
    }
  }, [submitted]);

  const isApproval = approvalState === "approved";
  const actionText = isApproval ? "Approving" : "Rejecting";

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-screen flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="flex flex-col items-center gap-4">
              <Page.Header
                title={
                  <span className="text-primary-100">
                    {actionText} tool execution...
                  </span>
                }
              />
              <p className="text-base text-primary-300">
                Processing your request, please wait.
              </p>
            </div>
          </div>
        </div>
      </main>
      {/* Hidden form auto-submitted by JS. */}
      <form
        ref={formRef}
        method="POST"
        action={`${config.getAppUrl()}/api/email/validate-action`}
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

function ResultView({ status, conversationId, workspaceId }: ResultViewProps) {
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

interface ErrorViewProps {
  errorType: string;
}

function ErrorView({ errorType }: ErrorViewProps) {
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
          </div>
        </div>
      </main>
    </>
  );
}
