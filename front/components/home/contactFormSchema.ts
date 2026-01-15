/**
 * Contact Form Schema
 *
 * This file re-exports the generated schema from HubSpot and adds
 * custom types that aren't part of the HubSpot form definition.
 *
 * The generated schema comes from HubSpot's form definition API.
 * To update when HubSpot fields change:
 *   1. Add HUBSPOT_PRIVATE_APP_TOKEN to .env.local
 *   2. Run: npm run generate:contact-form
 *   3. Commit the updated contactFormSchema.generated.ts
 */

// Re-export everything from generated file
export {
  ContactFormSchema,
  type ContactFormData,
  FIELD_DEFINITIONS,
  LANGUAGE_OPTIONS,
  HEADQUARTERS_REGION_OPTIONS,
  COMPANY_HEADCOUNT_FORM_OPTIONS,
} from "./contactFormSchema.generated";

// Tracking parameters captured from URL/sessionStorage
export interface TrackingParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  li_fat_id?: string;
}

// Response from the contact submit API
export interface ContactSubmitResponse {
  success: boolean;
  isQualified: boolean;
  error?: string;
}
