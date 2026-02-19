/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * This file is generated from HubSpot form definition.
 * Form ID: 15cb6f7e-6171-450a-a595-db93fc99a54c
 * Form Name: Become a partner
 *
 * To regenerate, run: npm run generate:hubspot-forms
 * Requires HUBSPOT_PRIVATE_APP_TOKEN in .env.local
 *
 * Generated at: 2026-01-23T10:06:05.468Z
 */

import { z } from "zod";

// Field options from HubSpot dropdown/checkbox/radio fields
export const HEADQUARTERS_REGION_OPTIONS = [
  { value: "Europe", label: "Europe" },
  { value: "North America", label: "North America" },
  { value: "Asia", label: "Asia" },
  { value: "Africa", label: "Africa" },
  { value: "Latin America", label: "Latin America" },
  { value: "Oceania", label: "Oceania" },
] as const;

export const PARTNER_IS_DUST_USER_OPTIONS = [
  { value: "IwsFdHQIoHiXOwBzo2nSI", label: "Yes" },
  { value: "Y05ie0S7hdKFTCXCgcz39", label: "No" },
] as const;

// Step 1 fields: "Become a Partner"
export const STEP_1_FIELDS = [
  "firstname",
  "lastname",
  "email",
  "company",
  "company_size",
  "headquarters_region",
] as const;

// Step 2 fields: "About a partnership"
export const STEP_2_FIELDS = [
  "partner_type",
  "partner_services",
  "partner_is_dust_user",
  "partner_additionnal_details",
] as const;

// Step 3 fields: "About your customers"
export const STEP_3_FIELDS = [
  "partner_customer_sizes",
  "enterprise_tool_stack",
  "any_existing_lead_to_share_",
] as const;

// Field definitions for dynamic form rendering
export const PARTNER_FIELD_DEFINITIONS = [
  {
    name: "firstname",
    label: "First Name",
    type: "text",
    required: true,
  },
  {
    name: "lastname",
    label: "Last Name",
    type: "text",
    required: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    required: true,
  },
  {
    name: "company",
    label: "Company Name",
    type: "text",
    required: true,
  },
  {
    name: "company_size",
    label: "Company size",
    type: "text",
    required: true,
  },
  {
    name: "headquarters_region",
    label: "What's your regional focus?",
    type: "dropdown",
    required: true,
    options: HEADQUARTERS_REGION_OPTIONS,
  },
  {
    name: "partner_type",
    label: "Which partner type most closely describes your company?",
    type: "text",
    required: true,
  },
  {
    name: "partner_services",
    label: "How would you envision a partnership with Dust?",
    type: "text",
    required: true,
  },
  {
    name: "partner_is_dust_user",
    label: "Are you an existing Dust user?",
    type: "radio",
    required: true,
    options: PARTNER_IS_DUST_USER_OPTIONS,
  },
  {
    name: "partner_additionnal_details",
    label: "Any details you'd like to give?",
    type: "textarea",
    required: false,
  },
  {
    name: "partner_customer_sizes",
    label: "What's the typical size of your client companies? ",
    type: "text",
    required: true,
  },
  {
    name: "enterprise_tool_stack",
    label: "What is their typical Enterprise Tool Stack?",
    type: "text",
    required: true,
  },
  {
    name: "any_existing_lead_to_share_",
    label: "Do you have a first opportunity in mind?",
    type: "text",
    required: false,
  },
] as const;

// Zod validation schema
export const PartnerFormSchema = z.object({
  firstname: z.string().min(1, "First Name is required"),
  lastname: z.string().min(1, "Last Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  company: z.string().min(1, "Company Name is required"),
  company_size: z.string().min(1, "Company size is required"),
  headquarters_region: z
    .string()
    .min(1, "What's your regional focus? is required"),
  partner_type: z.string().min(1, "Partner type is required"),
  partner_services: z
    .string()
    .min(1, "How would you envision a partnership with Dust? is required"),
  partner_is_dust_user: z
    .string()
    .min(1, "Are you an existing Dust user? is required"),
  partner_additionnal_details: z.string().optional(),
  partner_customer_sizes: z
    .string()
    .min(1, "What's the typical size of your client companies?  is required"),
  enterprise_tool_stack: z
    .string()
    .min(1, "What is their typical Enterprise Tool Stack? is required"),
  any_existing_lead_to_share_: z.string().optional(),
});

export type PartnerFormData = z.infer<typeof PartnerFormSchema>;

// Response from the partner submit API
export interface PartnerSubmitResponse {
  success: boolean;
  error?: string;
}
