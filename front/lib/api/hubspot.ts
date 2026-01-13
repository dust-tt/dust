import type {
  ContactFormData,
  TrackingParams,
} from "@app/components/home/contactFormSchema";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// HubSpot configuration
const HUBSPOT_PORTAL_ID = "144442587";
const HUBSPOT_FORM_ID = "95a83867-b22c-440a-8ba0-2733d35e4a7b";

interface HubSpotFormField {
  objectTypeId: string;
  name: string;
  value: string;
}

interface HubSpotSubmissionContext {
  hutk?: string;
  pageUri: string;
  pageName: string;
  ipAddress?: string;
}

interface HubSpotSubmissionRequest {
  submittedAt: number;
  fields: HubSpotFormField[];
  context: HubSpotSubmissionContext;
}

/**
 * Submit form data to HubSpot Forms API v3.
 * Docs: https://developers.hubspot.com/docs/api/marketing/forms
 *
 * The HubSpot Forms API is a public API that doesn't require authentication.
 * It uses the portal ID and form ID to identify where to submit the data.
 */
export async function submitToHubSpotForm(params: {
  formData: ContactFormData;
  tracking: TrackingParams;
  context: HubSpotSubmissionContext;
}): Promise<Result<void, Error>> {
  const { formData, tracking, context } = params;

  // Build form fields array
  const fields: HubSpotFormField[] = [];

  // Add form data fields
  const addField = (name: string, value: string | undefined) => {
    if (value !== undefined && value !== "") {
      fields.push({
        objectTypeId: "0-1", // Contact object type
        name,
        value,
      });
    }
  };

  // Form fields - matching HubSpot form configuration
  addField("email", formData.email);
  addField("firstname", formData.firstname);
  addField("lastname", formData.lastname);
  addField("phone", formData.phone);
  addField("language", formData.language);
  addField("headquarters_region", formData.headquarters_region);
  addField("company_headcount_form", formData.company_headcount_form);
  // "How do you want to use Dust?" maps to "Landing Use Cases" property
  addField("landing_use_cases", formData.how_to_use_dust);

  // UTM tracking fields - internal names have capital U
  addField("Utm_source", tracking.utm_source);
  addField("Utm_medium", tracking.utm_medium);
  addField("Utm_campaign", tracking.utm_campaign);
  addField("Utm_content", tracking.utm_content);
  addField("Utm_term", tracking.utm_term);
  // HubSpot's built-in property for Google Ads click ID
  addField("hs_google_click_id", tracking.gclid);
  addField("fbclid", tracking.fbclid);
  addField("msclkid", tracking.msclkid);
  addField("li_fat_id", tracking.li_fat_id);

  const submissionData: HubSpotSubmissionRequest = {
    submittedAt: Date.now(),
    fields,
    context,
  };

  // Log tracking data for debugging
  logger.info(
    {
      email: formData.email,
      gclid: tracking.gclid ?? "not set",
      utm_source: tracking.utm_source ?? "not set",
      fieldsCount: fields.length,
      fieldNames: fields.map((f) => f.name),
    },
    "Submitting to HubSpot with tracking data"
  );

  // Use the correct regional endpoint
  const endpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_ID}`;

  try {
    const response = await untrustedFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submissionData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText, fields },
        "HubSpot form submission failed"
      );
      return new Err(
        new Error(`HubSpot submission failed: ${response.status}`)
      );
    }

    logger.info(
      { email: formData.email, gclid: tracking.gclid ?? "not set" },
      "HubSpot form submission successful"
    );
    return new Ok(undefined);
  } catch (error) {
    logger.error({ error }, "HubSpot form submission error");
    return new Err(
      error instanceof Error ? error : new Error("HubSpot submission failed")
    );
  }
}

/**
 * Get Default.com scheduling URL with prefilled data.
 */
export function getDefaultSchedulingUrl(params: {
  email: string;
  firstName: string;
  lastName: string;
}): string {
  const { email, firstName, lastName } = params;

  // Default.com team scheduling URL
  // The form_id and team_id are from the current configuration
  const baseUrl = "https://app.default.com/dust-team";

  const searchParams = new URLSearchParams();
  searchParams.set("email", email);
  if (firstName) {
    searchParams.set("first_name", firstName);
  }
  if (lastName) {
    searchParams.set("last_name", lastName);
  }

  return `${baseUrl}?${searchParams.toString()}`;
}
