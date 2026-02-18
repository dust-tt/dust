import config from "@app/lib/api/config";
import { submitToHubSpotEbookForm } from "@app/lib/api/hubspot";
import type {
  EbookFormData,
  EbookSubmitResponse,
} from "@app/lib/api/hubspot/ebookFormSchema";
import {
  EbookFormSchema,
  TrackingParamsSchema,
} from "@app/lib/api/hubspot/ebookFormSchema";
import { extractDomain, hasValidMxRecords } from "@app/lib/utils/email";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { createHmac } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const TOKEN_EXPIRY_HOURS = 24;

function generateDownloadToken(): string {
  const secret = config.getGatedAssetsTokenSecret();
  const expiresMs = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const signature = createHmac("sha256", secret)
    .update(String(expiresMs))
    .digest("hex");
  return `${expiresMs}.${signature}`;
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: API route
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EbookSubmitResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  // Parse and validate form data
  const parseResult = EbookFormSchema.safeParse(req.body.formData);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: parseResult.error.errors[0]?.message ?? "Invalid form data",
    });
  }

  const formData: EbookFormData = parseResult.data;
  const tracking = TrackingParamsSchema.parse(req.body.tracking ?? {});
  const { pageUri, pageName } = req.body;
  const validPageUri = isString(pageUri) ? pageUri : "";
  const validPageName = isString(pageName)
    ? pageName
    : "Ebook - The Connected Enterprise AI Playbook";

  // Extract and validate domain
  const domain = extractDomain(formData.email);
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: "Invalid email format",
    });
  }

  // Check for personal email domains
  const isPersonalEmail = isPersonalEmailDomain(domain);

  // Check MX records for work emails
  if (!isPersonalEmail) {
    const hasMx = await hasValidMxRecords(domain);
    if (!hasMx) {
      return res.status(400).json({
        success: false,
        error: "Please use a valid work email address",
      });
    }
  }

  // Extract IP address from request headers
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress =
    (isString(forwardedFor) ? forwardedFor : forwardedFor?.[0])
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    undefined;

  // Submit to HubSpot
  const hubspotResult = await submitToHubSpotEbookForm({
    formData,
    tracking,
    context: {
      pageUri: validPageUri,
      pageName: validPageName,
      ipAddress,
    },
  });

  if (hubspotResult.isErr()) {
    logger.error(
      { error: hubspotResult.error },
      "Failed to submit ebook form to HubSpot"
    );
    return res.status(500).json({
      success: false,
      error: "Failed to submit form. Please try again.",
    });
  }

  const downloadToken = generateDownloadToken();

  return res.status(200).json({
    success: true,
    downloadToken,
  });
}
