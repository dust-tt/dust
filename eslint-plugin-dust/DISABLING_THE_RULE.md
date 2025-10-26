# Disabling the Schema Validation Rule

## Overview

The `dust/require-schema-validation` rule can be disabled using standard ESLint disable comments when needed for legitimate use cases like proxy endpoints or authentication flows.

## ESLint Disable Comments Work Correctly ✅

Both file-level and inline disable comments work as expected with this rule.

### File-Level Disable

Disable the rule for an entire file:

```typescript
/* eslint-disable dust/require-schema-validation */
// Pass through to external service, validation not required
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const externalData = await fetchFromExternalAPI();
  return res.json(externalData); // Not flagged
}
```

### Inline Disable

Disable the rule for a specific line:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const externalData = await fetchFromExternalAPI();
  // eslint-disable-next-line dust/require-schema-validation
  return res.json(externalData); // Not flagged
}
```

### Block Disable

Disable for a section of code:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (isProxyMode) {
    /* eslint-disable dust/require-schema-validation */
    const proxiedData = await proxyRequest();
    return res.json(proxiedData);
    /* eslint-enable dust/require-schema-validation */
  }

  // Rest of code still has rule enabled
  const validatedData = MySchema.strip().parse(data);
  return res.json(validatedData);
}
```

## Improved Pattern Detection

The rule now automatically handles common safe patterns without needing disable comments.

### Handler Delegation Pattern (Auto-Detected)

When you delegate to another handler function, the rule now recognizes this pattern:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.query;

  switch (action) {
    case "authorize":
      return handleAuthorize(req, res); // ✅ Not flagged (delegation detected)
    case "authenticate":
      return handleAuthenticate(req, res); // ✅ Not flagged
    case "logout":
      return handleLogout(req, res); // ✅ Not flagged
    default:
      return res.status(404).json({ error: "Not found" });
  }
}

// These handler functions are responsible for their own validation
async function handleAuthorize(req: NextApiRequest, res: NextApiResponse) {
  // ... handles response
}
```

**What's Detected:**
- Function calls with `(req, res)` or `(request, response)` parameters
- Common delegation pattern in route handlers
- Allows modular handler organization

### Error Handlers (Auto-Detected)

Error handling functions are automatically whitelisted:

```typescript
// ✅ These are automatically recognized and not flagged
return apiError(req, res, { status_code: 400, api_error: {...} });
return apiErrorForConversation(req, res, error);
return apiErrorForAssistant(req, res, error);
```

## When to Use Disable Comments

### ✅ Legitimate Use Cases

**1. Proxy Endpoints**

When forwarding responses from external services:

```typescript
/* eslint-disable dust/require-schema-validation */
// Proxy for WorkOS authentication - responses pass through unchanged
async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  const response = await fetch(`https://api.workos.com/authenticate`, {...});
  const data = await response.json();
  res.status(response.status).json(data); // Proxied response
}
```

**2. Third-Party API Wrappers**

When wrapping external APIs that provide their own validation:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // eslint-disable-next-line dust/require-schema-validation
  const stripeData = await stripe.charges.create(req.body);
  return res.json(stripeData); // Stripe SDK handles validation
}
```

**3. Binary or Non-JSON Responses**

When returning non-JSON data:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // eslint-disable-next-line dust/require-schema-validation
  const pdfBuffer = await generatePDF();
  res.setHeader('Content-Type', 'application/pdf');
  return res.send(pdfBuffer);
}
```

**4. Redirects**

When redirecting rather than returning JSON:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const logoutUrl = buildLogoutUrl(req.query);
  res.redirect(logoutUrl); // No validation needed for redirects
}
```

### ❌ When NOT to Disable

**Don't disable for:**
- Internal API responses that return database objects
- Responses that might contain sensitive internal fields
- Laziness - "I don't want to create a schema"
- "It works fine without validation"

## Example: Auth Proxy File

The `/pages/api/v1/auth/[action].ts` file is a good example of proper disable usage:

**Before (Manual Fix Required):**
```typescript
/* eslint-disable dust/enforce-client-types-in-public-api */
// Pass through to workOS, do not enforce return types.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (action) {
    case "authorize":
      return handleAuthorize(req, res); // ❌ Was flagged (now fixed)
    // ...
  }
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  const data = await response.json();
  res.status(response.status).json(data); // ❌ Still flagged (proxy data)
}
```

**After (Recommended Fix):**

Option 1: Disable for entire file since it's a proxy:
```typescript
/* eslint-disable dust/enforce-client-types-in-public-api */
/* eslint-disable dust/require-schema-validation */
// Pass through to workOS, do not enforce return types or schema validation.
```

Option 2: Disable only for proxy lines:
```typescript
async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  const data = await response.json();
  // eslint-disable-next-line dust/require-schema-validation
  res.status(response.status).json(data); // Proxied WorkOS response
}
```

## Verification Steps

After adding disable comments, verify they work:

```bash
# Check specific file
npx eslint pages/api/v1/your-file.ts

# Should show no violations for disabled rules
```

## Best Practices

1. **Add a Comment Explaining Why**
   ```typescript
   /* eslint-disable dust/require-schema-validation */
   // This endpoint proxies WorkOS authentication responses unchanged
   ```

2. **Be Specific**
   - Prefer inline disables over file-level when possible
   - Only disable for the specific lines that need it

3. **Document in Code**
   - Explain why validation is skipped
   - Reference design docs or tickets if applicable

4. **Review Periodically**
   - Proxy endpoints might eventually need schemas
   - Third-party APIs might change

## Summary

| Pattern | Status | Action Needed |
|---------|--------|---------------|
| Handler delegation `return handleAuth(req, res)` | ✅ Auto-detected | None |
| Error handlers `apiError(...)` | ✅ Auto-detected | None |
| Proxy responses `res.json(externalData)` | ⚠️ Flagged | Add disable comment |
| Binary responses `res.send(buffer)` | ⚠️ Flagged | Add disable comment |
| Redirects `res.redirect(url)` | ✅ Not flagged | None (no json/send call) |
| Internal API data `res.json(dbData)` | ❌ Flagged | Add validation (required!) |

## Impact on Codebase

After the handler delegation improvement:
- **Before**: 35 violations
- **After**: 33 violations (2 handler delegation patterns fixed)
- **Remaining**: Mostly legitimate data that should be validated, plus 1-2 proxy cases that need disable comments

The rule is working as intended - catching real validation gaps while allowing safe patterns through.
