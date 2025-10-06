# Dust PostHog Tracking Strategy

## Overview

We use a **hybrid tracking approach** that combines:

1. **Automatic tracking** for basic analytics (pageviews, session recordings)
2. **Smart autocapture** for UI interactions (with strict allowlists)
3. **Manual tracking** for critical business events

This approach balances comprehensive data collection with cost control.

## Cost Optimization

### Key Cost-Saving Measures

1. **`person_profiles: "identified_only"`** - Only create profiles for logged-in users (saves ~75% on anonymous events)
2. **Smart autocapture allowlists** - Only capture high-value elements
3. **No IP tracking** - Reduces data volume
4. **Query param stripping** - Cleaner data, less storage
5. **Session recordings only for identified users** - Reduces recording costs

### Event Volume Estimates

- **Anonymous visitors**: ~4x cheaper (pageviews only, no profiles)
- **Identified users**: Full tracking with profiles
- **First 1M events/month**: FREE
- **Expected monthly volume**: ~500K-800K events for typical B2B SaaS

## What We Track

### 1. Automatic (Always Captured)

```javascript
capture_pageview: true; // User navigation
capture_pageleave: true; // Engagement metrics
session_recording: true; // For identified users only
```

### 2. Smart Autocapture (CSS Selectors)

```javascript
// Only these elements trigger autocapture:
"[data-ph-capture]"; // Elements we explicitly mark
"button[type='submit']"; // Form submissions
"a[href^='/api/']"; // API actions
"a[href*='pricing']"; // Pricing interest
"a[href*='contact']"; // Sales interest
"[role='button']"; // Accessible buttons
```

### 3. Manual Tracking (Critical Events)

Use `trackEvent()` for:

- **Conversion events**: Signup, subscription, payment
- **Activation events**: First message with attachments/tools
- **Business metrics**: Feature usage, data connections
- **Revenue events**: Plan upgrades, trial conversions

## Implementation Guide

### For Critical Business Events (Manual)

```javascript
// Use trackEvent() for events that MUST be captured
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

// Example: Subscription start
onClick={() => {
  trackEvent(
    TRACKING_AREAS.AUTH,
    "subscription_start",
    "click",
    {
      billing_period: "monthly",
      is_trial: "true"
    }
  );
  // ... handle subscription
}}
```

### For Secondary UI Events (Autocapture)

```javascript
// Use trackingProps() for less critical UI interactions
import { trackingProps, TRACKING_AREAS } from "@app/lib/tracking";

// Example: Navigation link
<Link
  href="/features"
  {...trackingProps(TRACKING_AREAS.HOME, "features_nav", "click")}
>
  Features
</Link>;
```

### For Development/Testing

```javascript
// Check if event was captured in console
if (typeof window !== "undefined" && window.posthog) {
  window.posthog.debug(); // Enable debug mode
}
```

## Event Taxonomy

### Naming Convention

`{area}:{object}_{action}`

Examples:

- `home:hero_get_started_click`
- `conversation:message_send_submit`
- `datasources:provider_select_click`

### Areas

- `home` - Landing pages
- `pricing` - Pricing page
- `auth` - Authentication/onboarding
- `conversation` - Chat interface
- `datasources` - Data connections
- `builder` - Assistant builder
- `workspace` - Workspace settings
- `settings` - User settings

### Actions

- `click` - Button/link clicks
- `submit` - Form submissions
- `select` - Dropdown/option selections
- `create` - Resource creation
- `delete` - Resource deletion
- `connect` - Integration connections

## Critical Events (Must Track Manually)

### Conversion Funnel (22 events)

1. **Discovery (5 events)** - Homepage CTAs
2. **Evaluation (3 events)** - Pricing selections
3. **Onboarding (1 event)** - Account creation
4. **Subscription (5 events)** - Payment flow
5. **Data Connection (2 events)** - Integration setup
6. **Assistant Creation (3 events)** - Builder usage
7. **Activation (1 event)** - First complex message

### Revenue Events

- Trial starts
- Trial conversions
- Plan upgrades
- Subscription changes
- Churn events

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Daily event volume** - Alert if >50K/day
2. **Cost per event** - Should be <$0.00001
3. **Conversion rates** - Track funnel drop-offs
4. **Time to activation** - Median should be <7 days

### PostHog Dashboards

Create these dashboards:

1. **Usage & Costs** - Event volume by type
2. **Conversion Funnel** - Homepage → Activation
3. **User Journey** - Path analysis
4. **Feature Adoption** - Data sources, assistants
5. **Revenue Metrics** - Trial conversion, MRR

## Privacy & Compliance

### Data We DON'T Capture

- IP addresses (`property_denylist: ["$ip"]`)
- Query parameters (stripped in `sanitize_properties`)
- Form input values (`maskAllInputs: true`)
- Sensitive text (`maskTextSelector: "*"`)
- Cross-origin iframes

### GDPR Compliance

- Cookie consent required (`opt_out_capturing_by_default: true`)
- Users can opt-out anytime
- Data retention: 90 days default
- Right to deletion supported

## Troubleshooting

### Event Not Captured?

1. Check if cookies accepted
2. Verify PostHog loaded: `window.posthog?.__loaded`
3. Check element has `data-ph-capture` or manual tracking
4. Enable debug: `posthog.debug()`

### Too Many Events?

1. Review autocapture selectors
2. Add elements to ignore list
3. Consider sampling for high-volume events
4. Use `capture_pageview: false` for specific pages

### Cost Too High?

1. Disable session recording for trials
2. Reduce autocapture selectors
3. Sample events: `posthog.capture(event, props, { sample_rate: 0.1 })`
4. Set billing limits in PostHog dashboard

## Best Practices

1. **Start with manual tracking** for critical events
2. **Add autocapture gradually** as you understand patterns
3. **Review monthly** - Check what events are actually used
4. **Clean up unused events** - Remove tracking that isn't analyzed
5. **Document changes** - Keep this file updated
6. **Test in development** - Use PostHog debug mode
7. **Set up alerts** - For unusual volume spikes

## Quick Reference

```javascript
// Manual tracking (critical events)
trackEvent(area, object, action, extraProps);

// Autocapture (secondary events)
{...trackingProps(area, object, action, extraProps)}

// Check if tracking
posthog.debug();
posthog.get_distinct_id();
posthog.get_property('plan_code');
```
