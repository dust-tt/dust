#!/bin/bash
# Metronome Sandbox Setup — all API calls used to configure the sandbox environment.
# Run with: METRONOME_API_KEY=<key> bash metronome-sandbox-setup.sh
#
# This file is a reference log, not meant to be re-run blindly (IDs are hardcoded).

set -euo pipefail

API="https://api.metronome.com/v1"
AUTH="Authorization: Bearer $METRONOME_API_KEY"
CT="Content-Type: application/json"

# =============================================================================
# BILLABLE METRICS
# =============================================================================

# LLM Provider Cost (Programmatic) — SUM of cost_micro_usd for programmatic usage
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "LLM Provider Cost (Programmatic)",
  "event_type_filter": { "in_values": ["llm_usage"] },
  "property_filters": [
    { "name": "cost_micro_usd", "exists": true },
    { "name": "is_programmatic_usage", "in_values": ["true"] }
  ],
  "aggregation_type": "SUM",
  "aggregation_key": "cost_micro_usd"
}'
# -> id: 37cfaac4-d6a9-4bd3-9298-ab000936a6db

# LLM Provider Cost (User) — SUM of cost_micro_usd for user-initiated usage
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "LLM Provider Cost (User)",
  "event_type_filter": { "in_values": ["llm_usage"] },
  "property_filters": [
    { "name": "cost_micro_usd", "exists": true },
    { "name": "is_programmatic_usage", "in_values": ["false"] }
  ],
  "aggregation_type": "SUM",
  "aggregation_key": "cost_micro_usd"
}'
# -> id: f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77

# Tool Invocations (Programmatic) — COUNT succeeded tool uses, grouped by tool_category
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Invocations (Programmatic)",
  "event_type_filter": { "in_values": ["tool_use"] },
  "property_filters": [
    { "name": "status", "in_values": ["succeeded"] },
    { "name": "is_programmatic_usage", "in_values": ["true"] },
    { "name": "tool_category", "exists": true }
  ],
  "aggregation_type": "COUNT",
  "group_keys": [["tool_category"]]
}'
# -> id: 07273662-4b87-40c4-bff0-bb2c77274bd5

# Tool Invocations (User) — COUNT succeeded tool uses, grouped by tool_category
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Invocations (User)",
  "event_type_filter": { "in_values": ["tool_use"] },
  "property_filters": [
    { "name": "status", "in_values": ["succeeded"] },
    { "name": "is_programmatic_usage", "in_values": ["false"] },
    { "name": "tool_category", "exists": true }
  ],
  "aggregation_type": "COUNT",
  "group_keys": [["tool_category"]]
}'
# -> id: 6cb68db2-a3ea-4ac5-8a6d-6b951bd33446

# Active Seats — MAX gauge (analytics only, not used for billing)
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Active Seats",
  "event_type_filter": { "in_values": ["seats"] },
  "property_filters": [{ "name": "seat_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "seat_count"
}'
# -> id: ef99b99f-ac44-4f93-aefb-adf038e867cd

# Monthly Active Users — MAX gauge (analytics only, potential enterprise billing)
curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Monthly Active Users",
  "event_type_filter": { "in_values": ["mau"] },
  "property_filters": [{ "name": "mau_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "mau_count"
}'
# -> id: a321770f-b503-4db1-a47f-0543a6853e37

# =============================================================================
# PRODUCTS
# =============================================================================

# --- Usage products ---

# AI Usage (Programmatic) — USAGE, quantity_conversion divides micro-USD by 1M to get dollars
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "37cfaac4-d6a9-4bd3-9298-ab000936a6db",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: cb15d489-8c17-427d-84fd-f023b1872df1

# AI Usage (User) — USAGE, same conversion
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: 48df8307-205b-454c-b53c-427bbcc1321a

# Tool Usage (Programmatic) — USAGE, dimensional pricing by tool_category
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "07273662-4b87-40c4-bff0-bb2c77274bd5",
  "pricing_group_key": ["tool_category"]
}'
# -> id: ff905846-d539-4f06-a313-f8eb246c265e

# Tool Usage (User) — USAGE, dimensional pricing by tool_category
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "6cb68db2-a3ea-4ac5-8a6d-6b951bd33446",
  "pricing_group_key": ["tool_category"]
}'
# -> id: 7b416187-aacd-4ab6-9852-fb6ffe5ccd56

# --- Seat subscription products ---

# Pro Seat — SUBSCRIPTION product ($29/mo)
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Seat",
  "type": "SUBSCRIPTION"
}'
# -> id: 3bb03593-45b2-4b37-a2ce-3c2f41421f90

# Max Seat — SUBSCRIPTION product ($99/mo)
curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Max Seat",
  "type": "SUBSCRIPTION"
}'
# -> id: 9cec1c4a-a879-473d-a6aa-55d3e6b4b705

# =============================================================================
# RATE CARD: Pro Plan
# =============================================================================

curl -s -X POST "$API/contract-pricing/rate-cards/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Plan",
  "description": "Pro plan - Pro ($29) and Max ($99) seats + programmatic usage (30% markup)",
  "aliases": [{ "name": "pro-plan" }]
}'
# -> id: 8122410a-d4c5-40a2-973e-70df806eba58
# -> fiat_credit_type: USD (cents), id: 2714e483-4ff1-48e4-9e25-ac732e8f24f2

# Add all rates
curl -s -X POST "$API/contract-pricing/rate-cards/addRates" -H "$AUTH" -H "$CT" -d '{
  "rate_card_id": "8122410a-d4c5-40a2-973e-70df806eba58",
  "rates": [
    {
      "product_id": "3bb03593-45b2-4b37-a2ce-3c2f41421f90",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true,
      "rate_type": "FLAT",
      "price": 2900,
      "billing_frequency": "MONTHLY"
    },
    {
      "product_id": "9cec1c4a-a879-473d-a6aa-55d3e6b4b705",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true,
      "rate_type": "FLAT",
      "price": 9900,
      "billing_frequency": "MONTHLY"
    },
    {
      "product_id": "cb15d489-8c17-427d-84fd-f023b1872df1",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true,
      "rate_type": "FLAT",
      "price": 130
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "retrieval" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "deep_research" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "reasoning" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "connectors" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "generation" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "agents" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "actions" }
    },
    {
      "product_id": "ff905846-d539-4f06-a313-f8eb246c265e",
      "starting_at": "2026-04-01T00:00:00.000Z",
      "entitled": true, "rate_type": "FLAT", "price": 0,
      "pricing_group_values": { "tool_category": "platform" }
    }
  ]
}'

# =============================================================================
# PACKAGE: Pro Plan
# =============================================================================

# Package bundles rate card + seat subscriptions into a reusable template.
# Provisioning a customer is just: package_alias: "pro-plan"
curl -s -X POST "$API/packages/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Plan",
  "aliases": [{"name": "pro-plan"}],
  "rate_card_id": "8122410a-d4c5-40a2-973e-70df806eba58",
  "billing_provider": "stripe",
  "delivery_method": "direct_to_billing_provider",
  "subscriptions": [
    {
      "subscription_rate": {
        "billing_frequency": "MONTHLY",
        "product_id": "3bb03593-45b2-4b37-a2ce-3c2f41421f90"
      },
      "collection_schedule": "ADVANCE",
      "proration": { "is_prorated": true, "invoice_behavior": "BILL_IMMEDIATELY" },
      "quantity_management_mode": "SEAT_BASED",
      "seat_config": { "seat_group_key": "user_id" }
    },
    {
      "subscription_rate": {
        "billing_frequency": "MONTHLY",
        "product_id": "9cec1c4a-a879-473d-a6aa-55d3e6b4b705"
      },
      "collection_schedule": "ADVANCE",
      "proration": { "is_prorated": true, "invoice_behavior": "BILL_IMMEDIATELY" },
      "quantity_management_mode": "SEAT_BASED",
      "seat_config": { "seat_group_key": "user_id" }
    }
  ]
}'
# -> id: a7398553-6450-4a0c-b71c-10c3cdbcdc86

# =============================================================================
# CUSTOMER PROVISIONING (example)
# =============================================================================

# Provision a customer with the Pro package:
# curl -s -X POST "$API/contracts/create" -H "$AUTH" -H "$CT" -d '{
#   "customer_id": "<metronome_customer_uuid>",
#   "package_alias": "pro-plan"
# }'
#
# Assign a user to a Pro Seat:
# curl -s -X POST "$API/contracts/edit" -H "$AUTH" -H "$CT" -d '{
#   "contract_id": "<contract_id>",
#   "customer_id": "<customer_id>",
#   "subscription_edits": [{
#     "subscription_id": "<pro_seat_subscription_id>",
#     "add_seat_ids": ["user-sId-123"]
#   }]
# }'

# =============================================================================
# ID REFERENCE
# =============================================================================
#
# Billable Metrics:
#   LLM Provider Cost (Programmatic):  37cfaac4-d6a9-4bd3-9298-ab000936a6db
#   LLM Provider Cost (User):          f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77
#   Tool Invocations (Programmatic):    07273662-4b87-40c4-bff0-bb2c77274bd5
#   Tool Invocations (User):            6cb68db2-a3ea-4ac5-8a6d-6b951bd33446
#   Active Seats (analytics):           ef99b99f-ac44-4f93-aefb-adf038e867cd
#   Monthly Active Users (analytics):   a321770f-b503-4db1-a47f-0543a6853e37
#
# Products (USAGE):
#   AI Usage (Programmatic):            cb15d489-8c17-427d-84fd-f023b1872df1
#   AI Usage (User):                    48df8307-205b-454c-b53c-427bbcc1321a
#   Tool Usage (Programmatic):          ff905846-d539-4f06-a313-f8eb246c265e
#   Tool Usage (User):                  7b416187-aacd-4ab6-9852-fb6ffe5ccd56
#
# Products (SUBSCRIPTION):
#   Pro Seat:                           3bb03593-45b2-4b37-a2ce-3c2f41421f90
#   Max Seat:                           9cec1c4a-a879-473d-a6aa-55d3e6b4b705
#
# Rate Cards:
#   Pro Plan:                           8122410a-d4c5-40a2-973e-70df806eba58
#   USD (cents) credit type:            2714e483-4ff1-48e4-9e25-ac732e8f24f2
#
# Packages:
#   Pro Plan:                           a7398553-6450-4a0c-b71c-10c3cdbcdc86
