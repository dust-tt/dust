import { z } from "zod";

// Language options for the form
// Values must match HubSpot CRM values exactly
export const LANGUAGE_OPTIONS = [
  {
    value: "I would like my meeting to be in English 🇬🇧🇺🇸",
    label: "English",
  },
  { value: "I would like my meeting to be in French 🇫🇷", label: "French" },
] as const;

// Headquarters region options
// Values must match HubSpot CRM values exactly (capitalized)
export const HEADQUARTERS_REGION_OPTIONS = [
  { value: "North America", label: "North America" },
  { value: "Europe", label: "Europe" },
  { value: "Asia", label: "Asia" },
  { value: "Latin America", label: "Latin America" },
  { value: "Oceania", label: "Oceania" },
  { value: "Africa", label: "Africa" },
] as const;

// Company headcount options
export const COMPANY_HEADCOUNT_OPTIONS = [
  { value: "1-100", label: "1-100" },
  { value: "101-500", label: "101-500" },
  { value: "501-10000", label: "501-10,000" },
  { value: "10000+", label: "10,001+" },
] as const;

export const ContactFormSchema = z.object({
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z
    .string()
    .min(1, "Work email is required")
    .email("Please enter a valid email address"),
  phone: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  headquarters_region: z.string().optional(),
  company_headcount_form: z.string().min(1, "Company headcount is required"),
  how_to_use_dust: z.string().optional(),
});

export type ContactFormData = z.infer<typeof ContactFormSchema>;

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
