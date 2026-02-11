import { useState } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { TrackingArea } from "@app/lib/tracking";
import { trackEvent, TRACKING_ACTIONS } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import type { EnterpriseChoiceModalProps } from "./EnterpriseChoiceModal";

interface UseEnrichmentSubmitOptions {
  trackingArea: TrackingArea;
  trackingObject: string;
}

export function useEnrichmentSubmit({
  trackingArea,
  trackingObject,
}: UseEnrichmentSubmitOptions) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<{
    contactUrl: string;
    signupUrl: string;
    companyName?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    trackEvent({
      area: trackingArea,
      object: `${trackingObject}_email`,
      action: TRACKING_ACTIONS.SUBMIT,
    });

    setIsLoading(true);

    try {
      const response = await clientFetch("/api/enrichment/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.success && data.error) {
        setError(data.error);
        return;
      }

      if (data.redirectUrl) {
        if (data.redirectUrl.includes("/home/contact")) {
          const encodedEmail = encodeURIComponent(email);
          setEnterpriseData({
            contactUrl: data.redirectUrl,
            signupUrl: `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`,
            companyName: data.companyName,
          });
        } else {
          window.location.href = appendUTMParams(data.redirectUrl);
        }
      }
    } catch (err) {
      logger.error({ error: normalizeError(err) }, "Enrichment error");
      window.location.href = appendUTMParams(
        `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const enterpriseModalProps: EnterpriseChoiceModalProps = {
    isOpen: enterpriseData !== null,
    onClose: () => setEnterpriseData(null),
    companyName: enterpriseData?.companyName,
    contactUrl: enterpriseData?.contactUrl ?? "",
    signupUrl: enterpriseData?.signupUrl ?? "",
    trackingLocation: trackingObject,
  };

  return {
    email,
    setEmail,
    isLoading,
    error,
    handleSubmit,
    enterpriseModalProps,
  };
}
