#!/bin/bash
# Metronome Sandbox Setup — all API calls used to configure the sandbox environment.
# Run with: METRONOME_API_KEY=<key> bash metronome-sandbox-setup.sh
#
# This file is a reference log, not meant to be re-run blindly (IDs are hardcoded from
# initial sandbox creation). New objects get new IDs — update this file accordingly.
#
# See metronome-design-doc.md for the full architecture and rationale.

set -euo pipefail

API="https://api.metronome.com/v1"
AUTH="Authorization: Bearer $METRONOME_API_KEY"
CT="Content-Type: application/json"

# =============================================================================
# CUSTOM PRICING UNIT (created via Metronome UI)
# =============================================================================

# "AWU" (Agentic Work Unit) — 1 AWU = $0.01 (1 cent)
# -> id: 3c03babd-9113-4c48-aa24-eed6beced99f

# =============================================================================
# BILLABLE METRICS
# =============================================================================
# Metrics are shared across all plans (legacy + new pricing).
# The same events feed all metrics — what differs is which rate card uses them.

# --- LLM usage metrics (split by programmatic/user) ---

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

# --- Tool usage metrics (split by programmatic/user, grouped by category) ---

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

# --- Gauge metrics (daily snapshots) ---

# NOTE: "latest" aggregation_type is not supported by the Metronome API.
# Seat billing proration is handled natively by Metronome seat subscriptions.
# These gauges are for analytics, legacy free credit commits, and enterprise MAU contracts.

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Registered Users",
  "event_type_filter": { "in_values": ["registered_users"] },
  "property_filters": [{ "name": "member_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "member_count"
}'
# -> id: 9fc9758e-48a3-4904-baae-80fc190523da
# Used by: legacy plans (bracket-based free credit commit)

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "MAU (1+ messages)",
  "event_type_filter": { "in_values": ["mau_1"] },
  "property_filters": [{ "name": "mau_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "mau_count"
}'
# -> id: TODO
# Used by: legacy enterprise MAU_1 contracts

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "MAU (5+ messages)",
  "event_type_filter": { "in_values": ["mau_5"] },
  "property_filters": [{ "name": "mau_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "mau_count"
}'
# -> id: TODO
# Used by: legacy enterprise MAU_5 contracts

curl -s -X POST "$API/billable-metrics/create" -H "$AUTH" -H "$CT" -d '{
  "name": "MAU (10+ messages)",
  "event_type_filter": { "in_values": ["mau_10"] },
  "property_filters": [{ "name": "mau_count", "exists": true }],
  "aggregation_type": "max",
  "aggregation_key": "mau_count"
}'
# -> id: TODO
# Used by: legacy enterprise MAU_10 contracts

# NOTE: Metronome does not allow editing metrics — archive via:
#   curl -s -X POST "$API/billable-metrics/archive" -H "$AUTH" -H "$CT" -d '{"id": "<id>"}'

# =============================================================================
# PRODUCTS — Shared (used by both legacy and new pricing)
# =============================================================================

# --- Usage products ---

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "37cfaac4-d6a9-4bd3-9298-ab000936a6db",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: cb15d489-8c17-427d-84fd-f023b1872df1
# Priced in USD on legacy rate cards, AWU on new pricing rate cards

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (Programmatic)",
  "type": "USAGE",
  "billable_metric_id": "07273662-4b87-40c4-bff0-bb2c77274bd5",
  "pricing_group_key": ["tool_category"]
}'
# -> id: ff905846-d539-4f06-a313-f8eb246c265e
# 0-priced on legacy, AWU weights on new pricing

# --- Credit grant product (FIXED, for recurring credit line items) ---

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Included AWU Credits", "type": "FIXED"
}'
# -> id: 32ed1fad-ebcf-47a5-96aa-a348e353e21c

# =============================================================================
# PRODUCTS — Legacy only
# =============================================================================

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Legacy Seat ($29)", "type": "SUBSCRIPTION"
}'
# -> id: TODO
# Maps to current Pro $29/mo plan

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Legacy Seat ($39)", "type": "SUBSCRIPTION"
}'
# -> id: TODO
# Maps to current Business $39/mo plan (SSO)

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Legacy Enterprise Seat", "type": "SUBSCRIPTION"
}'
# -> id: TODO
# Seat-based enterprise, $45/mo (negotiable per deal)

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "MAU Reporting",
  "type": "USAGE",
  "billable_metric_id": "TODO_MAU_1_METRIC_ID"
}'
# -> id: TODO
# For MAU-based enterprise contracts only. Metric ID varies by threshold (MAU_1/5/10)

# =============================================================================
# PRODUCTS — New pricing only
# =============================================================================

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Pro Seat", "type": "SUBSCRIPTION"
}'
# -> id: 3bb03593-45b2-4b37-a2ce-3c2f41421f90
# $24/yr ($30/mo) + 5,000 AWU/month

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Max Seat", "type": "SUBSCRIPTION"
}'
# -> id: 9cec1c4a-a879-473d-a6aa-55d3e6b4b705
# $100/yr ($125/mo) + 20,000 AWU/month

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "AI Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "f8e26387-c2cd-4bcd-91cb-b76a5a8e3b77",
  "quantity_conversion": { "conversion_factor": 1000000, "operation": "divide" }
}'
# -> id: 48df8307-205b-454c-b53c-427bbcc1321a
# New pricing only — user (non-programmatic) AI usage in AWU

curl -s -X POST "$API/contract-pricing/products/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Tool Usage (User)",
  "type": "USAGE",
  "billable_metric_id": "6cb68db2-a3ea-4ac5-8a6d-6b951bd33446",
  "pricing_group_key": ["tool_category"]
}'
# -> id: 7b416187-aacd-4ab6-9852-fb6ffe5ccd56
# New pricing only — user (non-programmatic) tool usage in AWU

# =============================================================================
# RATE CARD: Legacy Pro $29 (Stripe-equivalent)
# =============================================================================

curl -s -X POST "$API/contract-pricing/rate-cards/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Legacy Pro $29",
  "description": "Grandfathered Pro plan at $29/seat/mo. Programmatic usage billed in USD with 30% markup. No user billing.",
  "aliases": [{"name": "legacy-pro-29"}],
  "fiat_credit_type_id": "2714e483-4ff1-48e4-9e25-ac732e8f24f2"
}'
# -> id: TODO

# Rates for legacy-pro-29:
# curl -s -X POST "$API/contract-pricing/rate-cards/addRates" -H "$AUTH" -H "$CT" -d '{
#   "rate_card_id": "TODO",
#   "rates": [
#     {"product_id":"TODO_LEGACY_SEAT_29","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2900,"billing_frequency":"MONTHLY"},
#     {"product_id":"cb15d489-8c17-427d-84fd-f023b1872df1","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":130},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"retrieval"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"deep_research"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"reasoning"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"connectors"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"generation"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"agents"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"actions"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"pricing_group_values":{"tool_category":"platform"}}
#   ]
# }'

# =============================================================================
# RATE CARD: Legacy Business $39 (Stripe-equivalent)
# =============================================================================

curl -s -X POST "$API/contract-pricing/rate-cards/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Legacy Business $39",
  "description": "Grandfathered Business plan at $39/seat/mo (includes SSO). Same usage pricing as Pro.",
  "aliases": [{"name": "legacy-business-39"}],
  "fiat_credit_type_id": "2714e483-4ff1-48e4-9e25-ac732e8f24f2"
}'
# -> id: TODO
# Same rates as legacy-pro-29 but with Legacy Seat ($39) at 3900 cents

# =============================================================================
# RATE CARD: New Business Plan (AWU credit-based)
# =============================================================================

# 1 AWU = $0.01 (1 cent)
curl -s -X POST "$API/contract-pricing/rate-cards/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Business Plan",
  "description": "New credit-based pricing. Seats in USD, usage in AWU ($0.01/credit).",
  "aliases": [{"name": "business-plan"}],
  "fiat_credit_type_id": "2714e483-4ff1-48e4-9e25-ac732e8f24f2",
  "credit_type_conversions": [{
    "custom_credit_type_id": "3c03babd-9113-4c48-aa24-eed6beced99f",
    "fiat_per_custom_credit": 1
  }]
}'
# -> id: TODO (replace old pro-plan rate card: 7cfe6f4c-75f6-4a56-b8c7-52dce3f85042)

# NOTE: fiat_per_custom_credit = 1 means 1 AWU = 1 cent ($0.01).
# Metronome fiat is in cents, so fiat_per_custom_credit=1 → $0.01/AWU.

# Rates for business-plan:
# curl -s -X POST "$API/contract-pricing/rate-cards/addRates" -H "$AUTH" -H "$CT" -d '{
#   "rate_card_id": "TODO",
#   "rates": [
#     {"product_id":"3bb03593-45b2-4b37-a2ce-3c2f41421f90","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":3000,"billing_frequency":"MONTHLY"},
#     {"product_id":"9cec1c4a-a879-473d-a6aa-55d3e6b4b705","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":12500,"billing_frequency":"MONTHLY"},
#     {"product_id":"cb15d489-8c17-427d-84fd-f023b1872df1","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":100,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
#     {"product_id":"48df8307-205b-454c-b53c-427bbcc1321a","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":100,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"retrieval"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"deep_research"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"reasoning"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"connectors"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"generation"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"agents"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"actions"}},
#     {"product_id":"ff905846-d539-4f06-a313-f8eb246c265e","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"platform"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"retrieval"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"deep_research"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"reasoning"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"connectors"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":2,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"generation"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":5,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"agents"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":1,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"actions"}},
#     {"product_id":"7b416187-aacd-4ab6-9852-fb6ffe5ccd56","starting_at":"2026-04-01T00:00:00.000Z","entitled":true,"rate_type":"FLAT","price":0,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f","pricing_group_values":{"tool_category":"platform"}}
#   ]
# }'
#
# NOTE: AI Usage price=100 AWU per $1 provider cost. At $0.01/AWU this is a 0% markup.
# To add X% markup, set price to 100*(1+X/100). E.g., 10% markup → price=110.
# Tool credit weights are proposals — see design doc for latest values.
# web_search priced at 0 AWU (free) per design decision.

# =============================================================================
# PACKAGE: Legacy Pro $29 (grandfathered)
# =============================================================================

# curl -s -X POST "$API/packages/create" -H "$AUTH" -H "$CT" -d '{
#   "name": "Legacy Pro $29",
#   "aliases": [{"name": "legacy-pro-29"}],
#   "rate_card_id": "TODO_LEGACY_PRO_RATE_CARD_ID",
#   "billing_provider": "stripe",
#   "delivery_method": "direct_to_billing_provider",
#   "subscriptions": [
#     {
#       "temporary_id": "legacy-seat-sub",
#       "subscription_rate": {"billing_frequency":"MONTHLY","product_id":"TODO_LEGACY_SEAT_29_PRODUCT_ID"},
#       "collection_schedule": "ADVANCE",
#       "proration": {"is_prorated":true,"invoice_behavior":"BILL_IMMEDIATELY"},
#       "quantity_management_mode": "SEAT_BASED",
#       "seat_config": {"seat_group_key": "user_id"}
#     }
#   ]
# }'
# NOTE: Legacy packages do NOT include recurring credits (credits managed via
# bracket-based free credit commit on registered_users gauge + syncMetronomeCreditGrantToDb).

# =============================================================================
# PACKAGE: Legacy Business $39 (grandfathered)
# =============================================================================

# Same structure as legacy-pro-29 but with Legacy Seat ($39) product at 3900 cents.
# curl -s -X POST "$API/packages/create" ... (same pattern, different seat product)

# =============================================================================
# PACKAGE: New Business Plan (AWU credit-based)
# =============================================================================

# Package includes:
# - 2 seat-based subscriptions (Pro + Max) with seat_group_key: "user_id"
# - 2 recurring per-seat credits: 5,000 AWU/mo per Pro seat, 20,000 per Max seat
# - Credits apply to all usage products (INDIVIDUAL allocation per seat)
curl -s -X POST "$API/packages/create" -H "$AUTH" -H "$CT" -d '{
  "name": "Business Plan",
  "aliases": [{"name": "business-plan"}],
  "rate_card_id": "TODO_BUSINESS_PLAN_RATE_CARD_ID",
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
      "access_amount": {"unit_price":5000,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
      "priority": 1,
      "commit_duration": {"value":1,"unit":"PERIODS"},
      "recurrence_frequency": "MONTHLY",
      "proration": "NONE",
      "starting_at_offset": {"value":0,"unit":"MONTHS"},
      "name": "Pro Seat Monthly AWU (5,000)",
      "applicable_product_ids": [
        "cb15d489-8c17-427d-84fd-f023b1872df1",
        "48df8307-205b-454c-b53c-427bbcc1321a",
        "ff905846-d539-4f06-a313-f8eb246c265e",
        "7b416187-aacd-4ab6-9852-fb6ffe5ccd56"
      ],
      "subscription_config": {
        "subscription_id": "pro-seat-sub",
        "apply_seat_increase_config": {"is_prorated":true},
        "allocation": "INDIVIDUAL"
      }
    },
    {
      "product_id": "32ed1fad-ebcf-47a5-96aa-a348e353e21c",
      "access_amount": {"unit_price":20000,"credit_type_id":"3c03babd-9113-4c48-aa24-eed6beced99f"},
      "priority": 1,
      "commit_duration": {"value":1,"unit":"PERIODS"},
      "recurrence_frequency": "MONTHLY",
      "proration": "NONE",
      "starting_at_offset": {"value":0,"unit":"MONTHS"},
      "name": "Max Seat Monthly AWU (20,000)",
      "applicable_product_ids": [
        "cb15d489-8c17-427d-84fd-f023b1872df1",
        "48df8307-205b-454c-b53c-427bbcc1321a",
        "ff905846-d539-4f06-a313-f8eb246c265e",
        "7b416187-aacd-4ab6-9852-fb6ffe5ccd56"
      ],
      "subscription_config": {
        "subscription_id": "max-seat-sub",
        "apply_seat_increase_config": {"is_prorated":true},
        "allocation": "INDIVIDUAL"
      }
    }
  ]
}'
# -> id: TODO (replace old pro-plan package: c9e6a035-5027-4cf2-9804-1084c4d6a303)

# =============================================================================
# ID REFERENCE (updated 2026-03-29)
# =============================================================================
#
# Pricing Units:
#   USD (cents):                         2714e483-4ff1-48e4-9e25-ac732e8f24f2
#   AWU ($0.01):                         1ad632f0-4e5a-44d6-a1bf-aa6f6bc550d8
#
# Billable Metrics:
#   LLM Provider Cost (Programmatic):    6e8a5f62-f170-4c83-93e0-8d26fb2fc4cd
#   LLM Provider Cost (User):            dd89ce8e-90ed-467e-9ff5-bdea64b147b8
#   Tool Invocations (Programmatic):     90e25083-43cf-489e-b3d8-63d7a172f351
#   Tool Invocations (User):             dca0b516-519d-4a77-8f39-3f6cd2e2e430
#   Registered Users (legacy):           6ba4deb2-6fef-446d-9b8c-7e6ddc4a74e1
#   MAU 1+ (legacy enterprise):          b407f5ea-5857-49da-aa1f-1782414b09fe
#   MAU 5+ (legacy enterprise):          7602bd3f-ace7-4c8a-9f8f-693cf7377fa1
#   MAU 10+ (legacy enterprise):         792044b0-d68d-4b78-aac6-c7f8126e1275
#
# Products — Shared:
#   AI Usage (Programmatic):             1df2b2ef-9f23-4cf4-8291-67c3a93065b5
#   Tool Usage (Programmatic):           f00ac575-11a3-4967-8635-b9de6596691a
#   Included AWU Credits:                da34bc12-2965-45bf-b1a7-6be4099fdf5e
#
# Products — Legacy only:
#   Legacy Seat ($29):                   6415fe52-2412-47fa-950c-cd44e31985b4
#   Legacy Seat ($39):                   49be6b36-4313-4ab0-b28e-337c934e2639
#   Legacy Enterprise Seat:              612ee492-18a4-493a-852e-890a8497e41a
#
# Products — New pricing:
#   Free Seat:                           de5685d1-6acb-4042-8091-412e7c0c2edb
#   Pro Seat:                            b852890e-bf8e-44ea-add7-1910af5c9151
#   Max Seat:                            68ae2029-c592-4a21-bd20-4d6bab7be9b8
#   AI Usage (User):                     2c9d8d9b-88a5-486a-b64c-c299e2603025
#   Tool Usage (User):                   c40d714d-1864-496b-9bf8-b164b87afe84
#
# Rate Cards:
#   Legacy Pro $29:                      33bba656-78bb-443c-8679-902a4f98c387
#   Legacy Business $39:                 8f4c8eb7-9cce-4342-b8ec-6d6d09a56311
#   Business Plan (new pricing):         702ccb3c-c6db-49b8-ade4-aa6c8be78d4c
#
# Packages:
#   legacy-pro-29:                       753d935f-54bf-446d-919a-3e84dddecba5
#   legacy-business-39:                  088311c2-f0cd-4bd9-ace9-7f9d16f55f1d
#   business-plan:                       574942a2-0182-4f1a-8563-6e6a4edd91c3
#
# Rate Summary — Legacy Pro/Business:
#   Legacy Seat ($29):       2900 USD cents ($29/mo)
#   Legacy Seat ($39):       3900 USD cents ($39/mo)
#   AI Usage (Prog):          130 USD cents per $1 cost (30% markup)
#   Tool Usage (Prog):          0 (not billed on legacy)
#
# Rate Summary — Business Plan (new pricing):
#   Free Seat:                0 USD cents ($0/mo)
#   Pro Seat:              3000 USD cents ($30/mo) or 2400 ($24/yr annual)
#   Max Seat:             12500 USD cents ($125/mo) or 10000 ($100/yr annual)
#   AI Usage (Prog):        100 AWU per $1 cost (0% markup, TBD 0-10%)
#   AI Usage (User):        100 AWU per $1 cost (same)
#   Tool: retrieval:          1 AWU
#   Tool: web_search:         0 AWU (free)
#   Tool: connectors:         1 AWU
#   Tool: actions:            1 AWU
#   Tool: deep_research:      0 AWU (NOTE: pricing TBD — currently free, may change)
#   Tool: generation:         2 AWU
#   Tool: agents:             5 AWU
#   Tool: reasoning:          5 AWU
#   Tool: platform:           0 AWU (free)
#
# Per-seat recurring credits (Business Plan):
#   Free Seat:    300 AWU/month (INDIVIDUAL allocation)
#   Pro Seat:   5,000 AWU/month (INDIVIDUAL allocation)
#   Max Seat:  20,000 AWU/month (INDIVIDUAL allocation)
