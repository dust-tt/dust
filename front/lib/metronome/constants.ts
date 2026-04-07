import { isDevelopment } from "@app/types/shared/env";

// Metronome product and billable metric IDs per environment.
// Created by metronome_setup.ts, stable across runs.

const DEV_FREE_CREDIT_PRODUCT_ID = "04f41dd1-ba27-42e3-93d5-6121712a4b67";
const DEV_COMMIT_PRODUCT_ID = "5f4331b7-4bf6-488b-9a0c-51bd139ac91c";

const DEV_LLM_PROGRAMMATIC_BILLABLE_METRIC_ID =
  "2ea30b38-690c-4ecb-8bdf-378d9e9d160b";
const DEV_TOOL_PROGRAMMATIC_BILLABLE_METRIC_ID =
  "90bbb915-9122-4ffa-b14a-40fc4d2a3e0f";

const PROD_FREE_CREDIT_PRODUCT_ID = "7379999c-5492-4e68-968f-345a26f6da63";
const PROD_COMMIT_PRODUCT_ID = "1408c9fc-dea1-4269-bd6d-1bc0aa1f1218";
const PROD_LLM_PROGRAMMATIC_BILLABLE_METRIC_ID =
  "c92011f4-d59b-4691-a518-0ad9eb3a0128";
const PROD_TOOL_PROGRAMMATIC_BILLABLE_METRIC_ID =
  "9b3a1c0f-1504-44f1-9d8b-7a247d149756";

export function getFreeCreditProductId() {
  return isDevelopment()
    ? DEV_FREE_CREDIT_PRODUCT_ID
    : PROD_FREE_CREDIT_PRODUCT_ID;
}

export function getCommitProductId() {
  return isDevelopment() ? DEV_COMMIT_PRODUCT_ID : PROD_COMMIT_PRODUCT_ID;
}

export function getLlmProgrammaticBillableMetricId() {
  return isDevelopment()
    ? DEV_LLM_PROGRAMMATIC_BILLABLE_METRIC_ID
    : PROD_LLM_PROGRAMMATIC_BILLABLE_METRIC_ID;
}

export function getToolProgrammaticBillableMetricId() {
  return isDevelopment()
    ? DEV_TOOL_PROGRAMMATIC_BILLABLE_METRIC_ID
    : PROD_TOOL_PROGRAMMATIC_BILLABLE_METRIC_ID;
}
