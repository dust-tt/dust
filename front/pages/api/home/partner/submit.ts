import { TrackingParamsSchema } from "@app/lib/api/hubspot/contactFormSchema";
import { submitToHubSpotPartnerForm } from "@app/lib/api/hubspot/hubspot";
import type {
  PartnerFormData,
  PartnerSubmitResponse,
} from "@app/lib/api/hubspot/partnerFormSchema";
import { PartnerFormSchema } from "@app/lib/api/hubspot/partnerFormSchema";
import { extractDomain, hasValidMxRecords } from "@app/lib/utils/email";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PartnerSubmitResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  // Parse and validate form data
  const parseResult = PartnerFormSchema.safeParse(req.body.formData);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.errors[0]?.message ?? "Invalid form data",
    });
  }

  const formData: PartnerFormData = parseResult.data;
  const tracking = TrackingParamsSchema.parse(req.body.tracking ?? {});
  const { pageUri: rawPageUri, pageName: rawPageName } = req.body;
  const pageUri = isString(rawPageUri) ? rawPageUri : "";
  const pageName = isString(rawPageName) ? rawPageName : "Partner with Dust";

  // Extract and validate domain
  const domain = extractDomain(formData.email);
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: "Invalid email format",
    });
  }

  // Check MX records for email domain
  const hasMx = await hasValidMxRecords(domain);
  if (!hasMx) {
    return res.status(400).json({
      success: false,
      error: "Please use a valid email address",
    });
  }

  // Extract IP address from request headers
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    undefined;

  // Submit to HubSpot
  const hubspotResult = await submitToHubSpotPartnerForm({
    formData,
    tracking,
    context: {
      pageUri,
      pageName,
      ipAddress,
    },
  });

  if (hubspotResult.isErr()) {
    logger.error(
      { error: hubspotResult.error },
      "Failed to submit partner form to HubSpot"
    );
    return res.status(500).json({
      success: false,
      error: "Failed to submit form. Please try again.",
    });
  }

  logger.info({ email: formData.email }, "Partner form submitted successfully");

  return res.status(200).json({
    success: true,
  });
}
