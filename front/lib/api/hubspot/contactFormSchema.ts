/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * This file is generated from HubSpot form definition.
 * Form ID: 95a83867-b22c-440a-8ba0-2733d35e4a7b
 * Form Name: Demo Contact Form - v3 - 2025-10-10
 *
 * To regenerate, run: npm run generate:hubspot-forms
 * Requires HUBSPOT_PRIVATE_APP_TOKEN in .env.local
 *
 * Generated at: 2026-01-23T10:06:05.263Z
 */

import { z } from "zod";

// Field options from HubSpot dropdown/checkbox/radio fields
export const LANGUAGE_OPTIONS = [
  {
    value: "I would like my meeting to be in English 🇬🇧🇺🇸",
    label: "I would like my meeting to be in English",
  },
  {
    value: "I would like my meeting to be in French 🇫🇷",
    label: "I would like my meeting to be in French 🇫🇷",
  },
] as const;

export const HEADQUARTERS_REGION_OPTIONS = [
  { value: "Europe", label: "Europe" },
  { value: "North America", label: "North America" },
  { value: "Asia", label: "Asia" },
  { value: "Africa", label: "Africa" },
  { value: "Latin America", label: "Latin America" },
  { value: "Oceania", label: "Oceania" },
] as const;

export const COMPANY_HEADCOUNT_FORM_OPTIONS = [
  { value: "1-100", label: "1-100" },
  { value: "101-500", label: "101-500" },
  { value: "501-1000", label: "501-10000" },
  { value: "10000+", label: "10000+" },
] as const;

// Field definitions for dynamic form rendering
export const FIELD_DEFINITIONS = [
  {
    name: "firstname",
    label: "First Name",
    type: "text",
    required: false,
  },
  {
    name: "lastname",
    label: "Last Name",
    type: "text",
    required: false,
  },
  {
    name: "email",
    label: "Work Email",
    type: "email",
    required: true,
  },
  {
    name: "mobilephone",
    label: "Phone Number",
    type: "text",
    required: false,
  },
  {
    name: "language",
    label: "Language",
    type: "dropdown",
    required: true,
    options: LANGUAGE_OPTIONS,
  },
  {
    name: "headquarters_region",
    label: "Headquarters Region",
    type: "dropdown",
    required: false,
    options: HEADQUARTERS_REGION_OPTIONS,
  },
  {
    name: "company_headcount_form",
    label: "Company Headcount",
    type: "dropdown",
    required: true,
    options: COMPANY_HEADCOUNT_FORM_OPTIONS,
  },
  {
    name: "landing_use_cases",
    label: "How do you want to use Dust?",
    type: "textarea",
    required: false,
  },
] as const;

// Zod validation schema
export const ContactFormSchema = z.object({
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z
    .string()
    .min(1, "Work Email is required")
    .email("Please enter a valid email address"),
  mobilephone: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  headquarters_region: z.string().optional(),
  company_headcount_form: z.string().min(1, "Company headcount is required"),
  landing_use_cases: z.string().optional(),
  // Local field for GDPR marketing consent (not sent to HubSpot)
  consent_marketing: z.boolean().optional(),
});

export type ContactFormData = z.infer<typeof ContactFormSchema>;

// Tracking parameters captured from URL/sessionStorage
export const TrackingParamsSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  msclkid: z.string().optional(),
  li_fat_id: z.string().optional(),
});

export type TrackingParams = z.infer<typeof TrackingParamsSchema>;

// Response from the contact submit API
export interface ContactSubmitResponse {
  success: boolean;
  isQualified: boolean;
  error?: string;
}
