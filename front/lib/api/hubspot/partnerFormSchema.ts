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
 * Generated at: 2026-03-20T09:02:19.066Z
 */

import { z } from "zod";

// Field options from HubSpot dropdown/checkbox/radio fields
export const PARTNER_BUSINESS_MODEL_OPTIONS = [
  { value: "I help clients implement and optimize AI tools", label: "I help clients implement and optimize AI tools" },
  { value: "I create content or build community around AI tools", label: "I create content or build community around AI tools" },
  { value: "I have a marketplace of B2B tools", label: "I have a marketplace of B2B tools" },
  { value: "I build integrations or complementary products", label: "I build integrations or complementary products" },
] as const;

export const HEADQUARTERS_REGION_OPTIONS = [
  { value: "Europe", label: "Europe" },
  { value: "North America", label: "North America" },
  { value: "Asia", label: "Asia" },
  { value: "Africa", label: "Africa" },
  { value: "Latin America", label: "Latin America" },
  { value: "Oceania", label: "Oceania" },
] as const;

export const COMPANY_INDUSTRY_OPTIONS = [
  { value: "Option 1", label: "Tech - B2B SaaS" },
  { value: "Option 2", label: "Tech - Marketplace" },
  { value: "Retail & E-Commerce", label: "Retail &amp; E-Commerce" },
  { value: "Insurance", label: "Insurance" },
  { value: "Financial services", label: "Financial services" },
  { value: "Media", label: "Media" },
  { value: "Energy & Utilities", label: "Energy &amp; Utilities" },
  { value: "Consulting Firms & Agencies", label: "Consulting Firms &amp; Agencies" },
  { value: "Investment Firms", label: "Investment Firms" },
  { value: "Content & Entertainment", label: "Content &amp; Entertainment" },
  { value: "Industrial Manufacturing", label: "Industrial Manufacturing" },
  { value: "Real Estate & Construction", label: "Real Estate &amp; Construction" },
  { value: "Telecommunications", label: "Telecommunications" },
  { value: "Other", label: "Other" },
] as const;

export const PARTNER_PROJECT_DURATION_OPTIONS = [
  { value: "1-2 weeks", label: "1-2 weeks" },
  { value: "3-8 weeks", label: "3-8 weeks" },
  { value: "2-6 months", label: "2-6 months" },
  { value: "6+ months", label: "6+ months" },
] as const;

export const PARTNER_AI_PROFICIENCY_OPTIONS = [
  { value: "using conversational AI (eg. chatGPT) -", label: "using conversational AI (eg. chatGPT) -" },
  { value: "have built multiple agents & workflows with AI", label: "have built multiple agents &amp; workflows with AI" },
  { value: "have given AI trainings", label: "have given AI trainings" },
  { value: "have implemented AI agents for customers", label: "have implemented AI agents for customers" },
] as const;

export const PARTNER_DUST_USAGE_DURATION_OPTIONS = [
  { value: "Haven't yet", label: "Haven't yet" },
  { value: "1-3 months", label: "1-3 months" },
  { value: "3-12 months", label: "3-12 months" },
  { value: "12+ months", label: "12+ months" },
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
    name: "hs_linkedin_url",
    label: "LinkedIn URL",
    type: "text",
    required: true,
  },
  {
    name: "partner_business_model",
    label: "What is your main business model?\n",
    type: "dropdown",
    required: true,
    options: PARTNER_BUSINESS_MODEL_OPTIONS,
  },
  {
    name: "headquarters_region",
    label: "What's your regional focus?",
    type: "dropdown",
    required: true,
    options: HEADQUARTERS_REGION_OPTIONS,
  },
  {
    name: "company_industry",
    label: "What industry do you specialize in?",
    type: "dropdown",
    required: true,
    options: COMPANY_INDUSTRY_OPTIONS,
  },
  {
    name: "partner_customer_sizes",
    label: "What's the typical size of your client companies? ",
    type: "text",
    required: true,
  },
  {
    name: "partner_project_duration",
    label: "What is your average project duration?",
    type: "dropdown",
    required: true,
    options: PARTNER_PROJECT_DURATION_OPTIONS,
  },
  {
    name: "technical_staff",
    label: "How many technical staff do you have dedicated to implementations?",
    type: "number",
    required: true,
  },
  {
    name: "partner_ai_proficiency",
    label: "What’s the current level of your team on AI?",
    type: "dropdown",
    required: true,
    options: PARTNER_AI_PROFICIENCY_OPTIONS,
  },
  {
    name: "partner_dust_usage_duration",
    label: "How long have you been using Dust?",
    type: "dropdown",
    required: true,
    options: PARTNER_DUST_USAGE_DURATION_OPTIONS,
  },
  {
    name: "partner_agent_example",
    label: "Share your favorite Dust Agent you’ve built",
    type: "text",
    required: true,
  },
  {
    name: "partner_dust_clients",
    label: "How many Dust clients do you currently have?",
    type: "number",
    required: true,
  },
  {
    name: "any_existing_lead_to_share_",
    label: "Do you have a first opportunity in mind?",
    type: "text",
    required: true,
  },
  {
    name: "partner_additionnal_details",
    label: "How would you envision a partnership with Dust?",
    type: "textarea",
    required: true,
  },
  {
    name: "partner_other_partnerhips",
    label: "Are you a partner for any other tools? and AI or Agentic tools? (If yes, list them below)",
    type: "text",
    required: false,
  },
] as const;

// Zod validation schema
export const PartnerFormSchema = z.object({
  firstname: z.string().min(1, "First Name is required"),
  lastname: z.string().min(1, "Last Name is required"),
  email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
  company: z.string().min(1, "Company Name is required"),
  hs_linkedin_url: z.string().min(1, "LinkedIn URL is required"),
  partner_business_model: z.string().min(1, "What is your main business model? is required"),
  headquarters_region: z.string().min(1, "What's your regional focus? is required"),
  company_industry: z.string().min(1, "What industry do you specialize in? is required"),
  partner_customer_sizes: z.string().min(1, "What's the typical size of your client companies?  is required"),
  partner_project_duration: z.string().min(1, "What is your average project duration? is required"),
  technical_staff: z.string().min(1, "How many technical staff do you have dedicated to implementations? is required"),
  partner_ai_proficiency: z.string().min(1, "What’s the current level of your team on AI? is required"),
  partner_dust_usage_duration: z.string().min(1, "How long have you been using Dust? is required"),
  partner_agent_example: z.string().min(1, "Share your favorite Dust Agent you’ve built is required"),
  partner_dust_clients: z.string().min(1, "How many Dust clients do you currently have? is required"),
  any_existing_lead_to_share_: z.string().min(1, "Do you have a first opportunity in mind? is required"),
  partner_additionnal_details: z.string().min(1, "How would you envision a partnership with Dust? is required"),
  partner_other_partnerhips: z.string().optional(),
});

export type PartnerFormData = z.infer<typeof PartnerFormSchema>;

// Response from the partner submit API
export interface PartnerSubmitResponse {
  success: boolean;
  error?: string;
}
