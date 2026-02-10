import { Button, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";

import config from "@app/lib/api/config";
import { verifyValidationToken } from "@app/lib/api/email/validation_token";

type ValidationConfirmProps = {
  token: string;
  approvalState: "approved" | "rejected";
  error: string | null;
};

export const getServerSideProps: GetServerSideProps<
  ValidationConfirmProps
> = async (context) => {
  const { token } = context.query;

  if (typeof token !== "string") {
    return {
      props: {
        token: "",
        approvalState: "approved",
        error: "invalid",
      },
    };
  }

  // Verify the token is valid (but don't perform the action yet).
  const tokenResult = verifyValidationToken(token);
  if (tokenResult.isErr()) {
    const errorType = tokenResult.error.type;
    return {
      props: {
        token: "",
        approvalState: "approved",
        error:
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
      token,
      approvalState: tokenResult.value.approvalState,
      error: null,
    },
  };
};

function getErrorContent(error: string) {
  switch (error) {
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

export default function ValidationConfirm({
  token,
  approvalState,
  error,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (error) {
    const { title, message } = getErrorContent(error);
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

  const isApproval = approvalState === "approved";
  const actionText = isApproval ? "Approve" : "Reject";
  const actionColor = isApproval ? "text-success-500" : "text-warning-500";

  const handleSubmit = () => {
    setIsSubmitting(true);
    // Form will submit naturally
  };

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
                  <span className={actionColor}>
                    {actionText} Tool Execution?
                  </span>
                }
              />
              <p className="text-base text-primary-100">
                {isApproval
                  ? "Click the button below to approve the tool execution."
                  : "Click the button below to reject the tool execution."}
              </p>
            </div>

            <form
              method="POST"
              action={`${config.getAppUrl()}/api/email/validate-action`}
              onSubmit={handleSubmit}
            >
              <input type="hidden" name="token" value={token} />
              <Button
                type="submit"
                variant={isApproval ? "primary" : "warning"}
                label={isSubmitting ? "Processing..." : `Confirm ${actionText}`}
                size="md"
                disabled={isSubmitting}
              />
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
