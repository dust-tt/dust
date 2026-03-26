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
# CUSTOM PRICING UNIT (created via Metronome UI)
# =============================================================================

# "Dust Credit" — 1 credit = $0.05 (5 cents)
# -> id: 3c03babd-9113-4c48-aa24-eed6beced99f

# =============================================================================
# BILLABLE METRICS
# =============================================================================

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

# NOTE: Metronome does not allow editing metrics — archive via:
#   curl -s -X POST "$API/billable-metrics/archive" -H "$AUTH" -H "$CT" -d '{"id": "<id>"}'
#
# "Active Seats" (old name, MAX agg) archived: ef99b99f-ac44-4f93-aefb-adf038e867cd
# "Monthly Active Users" (old, MAX agg) archived: a321770f-b503-4db1-a47f-0543a6853e37
#
# NOTE: "latest" aggregation_type is not supported by the Metronome API.
# These are analytics-only metrics — actual seat billing proration is handled natively
# by Metronome's seat-based subscriptions (configured with is_prorated: true in the package).
# We still emit daily snapshots with start-of-day timestamps + date-based transaction IDs
# for idempotency and observability.

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Registered Users",
  "event_type_filter": { "in_values": ["registered_users"] },
  "property_filters": [{ "name": "member_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "member_count"
}'
# -> id: 9fc9758e-48a3-4904-baae-80fc190523da (analytics only)

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Monthly Active Users",
  "event_type_filter": { "in_values": ["mau"] },
  "property_filters": [{ "name": "mau_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "mau_count"
}'
# -> id: 6184b08d-8d76-4b1a-b8f9-0003aec6a35a (analytics only)

# =============================================================================
# PRODUCTS
# =============================================================================

# --- Usage products (priced in Dust Credits on rate card) ---

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "37cfaac4-d6a9-4bd3-9298-ab000936a6db",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: cb15d489-8c17-427d-84fd-f023b1872df1

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: 48df8307-205b-454c-b53c-427bbcc1321a

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "07273662-4b87-40c4-bff0-bb2c77274bd5",
  "pricing_group_key": ["tool_category"]
}'
# -> id: ff905846-d539-4f06-a313-f8eb246c265e

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "6cb68db2-a3ea-4ac5-8a6d-6b951bd33446",
  "pricing_group_key": ["tool_category"]
}'
# -> id: 7b416187-aacd-4ab6-9852-fb6ffe5ccd56

# --- Credit grant product (FIXED, for recurring credit line items) ---

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Included Dust Credits", "type": "FIXED"
}'
# -> id: 32ed1fad-ebcf-47a5-96aa-a348e353e21c

# --- Seat subscription products (priced in USD cents on rate card) ---

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Seat", "type": "SUBSCRIPTION"
}'
# -> id: 3bb03593-45b2-4b37-a2ce-3c2f41421f90

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Max Seat", "type": "SUBSCRIPTION"
}'
# -> id: 9cec1c4a-a879-473d-a6aa-55d3e6b4b705

# =============================================================================
# RATE CARD: Pro Plan (with Dust Credits)
# =============================================================================

# fiat = USD (cents), 1 Dust Credit = 5 cents ($0.05)
curl -s -X POST "$API/contract-pricing/rate-cards/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Plan",
  "description": "Pro ($29) and Max ($99) seats in USD, usage in Dust Credits ($0.05/credit)",
  "aliases": [{"name": "pro-plan"}],
  "fiat_credit_type_id": "2714e483-4ff1-48e4-9e25-ac732e8f24f2",
  "credit_type_conversions": [{
    "custom_credit_type_id": "3c03babd-9113-4c48-aa24-eed6beced99f",
    "fiat_per_custom_credit": 5
  }]
}'
# -> id: 7cfe6f4c-75f6-4a56-b8c7-52dce3f85042

curl -s -X POST "$API/contract-pricing/rate-cards/addRates" -H "$AUTH" -H "$CT" -d '{
  "rate_card_id": "7cfe6f4c-75f6-4a56-b8c7-52dce3f85042",
  "rates": [
    {"product_id":"3bb03593-45b2-4b37-a2ce-3c2f41421f90","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2900,"billing_frequency":"MONTHLY"},
    {"product_id":"9cec1c4a-a879-473d-a6aa-55d3e6b4b705","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":9900,"billing_frequency":"MONTHLY"},
    {"product_id":"cb15d489-8c17-427d-84fd-f023b1872df1","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":26,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"retrieval"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"deep_research"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"reasoning"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"connectors"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"generation"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"agents"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"actions"}},
    {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"platform"}}
  ]
}'

# =============================================================================
# PACKAGE: Pro Plan
# =============================================================================

# Package includes:
# - 2 seat-based subscriptions (Pro + Max) with seat_group_key: "user_id"
# - 2 recurring per-seat credits: 200 Dust Credits/mo per Pro seat, 1000 per Max seat
# - Credits apply to AI Usage + Tool Usage products (INDIVIDUAL allocation per seat)
curl -s -X POST "$API/packages/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Plan",
  "aliases": [{"name": "pro-plan"}],
  "rate_card_id": "7cfe6f4c-75f6-4a56-b8c7-52dce3f85042",
  "billing_provider": "stripe",
  "delivery_method": "direct_to_billing_provider",
  "subscriptions": [
    {
      "temporary_id": "pro-seat-sub",
      "subscription_rate": {"billing_frequency":"MONTHLY","product_id":"3bb03593-45b2-4b37-a2ce-3c2f41421f90"},
      "collection_schedule": "ADVANCE",
      "proration": {"is_prorated":true,"invoice_behavior":"BILL_IMMEDIATELY"},
      "quantity_management_mode": "SEAT_BASED",
      "seat_config": {"seat_group_key": "user_id"}
    },
    {
      "temporary_id": "max-seat-sub",
      "subscription_rate": {"billing_frequency":"MONTHLY","product_id":"9cec1c4a-a879-473d-a6aa-55d3e6b4b705"},
      "collection_schedule": "ADVANCE",
      "proration": {"is_prorated":true,"invoice_behavior":"BILL_IMMEDIATELY"},
      "quantity_management_mode": "SEAT_BASED",
      "seat_config": {"seat_group_key": "user_id"}
    }
  ],
  "recurring_credits": [
    {
      "product_id": "32ed1fad-ebcf-47a5-96aa-a348e353e21c",
      "access_amount": {"unit_price":200,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
      "priority": 1,
      "commit_duration": {"value":1,"unit":"PERIODS"},
      "recurrence_frequency": "MONTHLY",
      "proration": "NONE",
      "starting_at_offset": {"value":0,"unit":"MONTHS"},
      "name": "Pro Seat Monthly Credits (200)",
      "applicable_product_ids": ["cb15d489-8c17-427d-84fd-f023b1872df1","ff905846-d539-4f06-a313-f8eb246c265e"],
      "subscription_config": {
        "subscription_id": "pro-seat-sub",
        "apply_seat_increase_config": {"is_prorated":true},
        "allocation": "INDIVIDUAL"
      }
    },
    {
      "product_id": "32ed1fad-ebcf-47a5-96aa-a348e353e21c",
      "access_amount": {"unit_price":1000,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
      "priority": 1,
      "commit_duration": {"value":1,"unit":"PERIODS"},
      "recurrence_frequency": "MONTHLY",
      "proration": "NONE",
      "starting_at_offset": {"value":0,"unit":"MONTHS"},
      "name": "Max Seat Monthly Credits (1000)",
      "applicable_product_ids": ["cb15d489-8c17-427d-84fd-f023b1872df1","ff905846-d539-4f06-a313-f8eb246c265e"],
      "subscription_config": {
        "subscription_id": "max-seat-sub",
        "apply_seat_increase_config": {"is_prorated":true},
        "allocation": "INDIVIDUAL"
      }
    }
  ]
}'
# -> id: c9e6a035-5027-4cf2-9804-1084c4d6a303

# =============================================================================
# ID REFERENCE
# =============================================================================
#
# Pricing Units:
#   USD (cents):                         2714e483-4ff1-48e4-9e25-ac732e8f24f2
#   Dust Credit ($0.05):                 3c03babd-9113-4c48-aa24-eed6beced99f
#
# Billable Metrics:
#   LLM Provider Cost (Programmatic):    37cfaac4-d6a9-4bd3-9298-ab000936a6db
#   LLM Provider Cost (User):            f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77
#   Tool Invocations (Programmatic):      07273662-4b87-40c4-bff0-bb2c77274bd5
#   Tool Invocations (User):              6cb68db2-a3ea-4ac5-8a6d-6b951bd33446
#   Registered Users (analytics):           9fc9758e-48a3-4904-baae-80fc190523da
#   Monthly Active Users (analytics):        6184b08d-8d76-4b1a-b8f9-0003aec6a35a
#
# Products (USAGE — priced in Dust Credits):
#   AI Usage (Programmatic):              cb15d489-8c17-427d-84fd-f023b1872df1
#   AI Usage (User):                      48df8307-205b-454c-b53c-427bbcc1321a
#   Tool Usage (Programmatic):            ff905846-d539-4f06-a313-f8eb246c265e
#   Tool Usage (User):                    7b416187-aacd-4ab6-9852-fb6ffe5ccd56
#
# Products (FIXED — credit grant line item):
#   Included Dust Credits:                32ed1fad-ebcf-47a5-96aa-a348e353e21c
#
# Products (SUBSCRIPTION — priced in USD cents):
#   Pro Seat:                             3bb03593-45b2-4b37-a2ce-3c2f41421f90
#   Max Seat:                             9cec1c4a-a879-473d-a6aa-55d3e6b4b705
#
# Rate Cards:
#   Pro Plan:                             7cfe6f4c-75f6-4a56-b8c7-52dce3f85042
#
# Packages:
#   Pro Plan:                             c9e6a035-5027-4cf2-9804-1084c4d6a303
#
# Rate Summary (Pro Plan):
#   Pro Seat:            2900 USD cents ($29/mo)
#   Max Seat:            9900 USD cents ($99/mo)
#   AI Usage (Prog):       26 Dust Credits per $1 provider cost (= 30% markup)
#   Tool: retrieval:        1 Dust Credit
#   Tool: connectors:       1 Dust Credit
#   Tool: actions:          1 Dust Credit
#   Tool: deep_research:    2 Dust Credits
#   Tool: generation:       2 Dust Credits
#   Tool: agents:           5 Dust Credits
#   Tool: reasoning:        5 Dust Credits
#   Tool: platform:         0 (free)
