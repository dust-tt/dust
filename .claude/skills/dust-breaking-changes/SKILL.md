---
name: dust-breaking-changes
description: CRITICAL guideline - Never introduce breaking changes to the private API without explicit user approval. Always warn and ask for validation first.
---

# API Breaking Changes - Critical Rule

**CRITICAL**: You must NEVER introduce breaking changes to the private API without explicit user approval.

## What is a Breaking Change?

A breaking change is any modification that would require existing API consumers to update their code, including:

- **Endpoints**: Removing or renaming API endpoints
- **Schemas**: Changing request/response schemas
  - Removing fields from responses
  - Changing field types (string → number, object → array, etc.)
  - Making optional fields required
  - Renaming fields
- **Authentication**: Modifying authentication or authorization requirements
- **HTTP Methods**: Changing HTTP methods (GET → POST) or status codes
- **Error Formats**: Altering error response formats or codes
- **Query Parameters**: Removing or making required previously optional parameters
- **Headers**: Requiring new headers or changing header validation

## Process for API Changes

Before making ANY change to API code, follow this process:

### 1. Identify API Code

API code includes:

- Route handlers in `front/pages/api/**`
- Request/response type definitions used by these routes
- Validation schemas (Zod, etc.) used in API handlers
- Middleware that affects API behavior

### 2. Analyze Impact

When you're about to modify API code, ask yourself:

- Will this change the shape of the response?
- Will this require API consumers to update their code?
- Could this break existing integrations or clients?

### 3. If Breaking Change: STOP and Warn

If the answer to any of the above is "yes":

**DO NOT PROCEED WITH THE CHANGE**

Instead:

1. **STOP** immediately
2. **WARN** the user with a clear message like:

   ```
   ⚠️ WARNING: Breaking API Change Detected

   The proposed change would be a breaking change to the private API:
   [Explain what specifically would break]

   Impact:
   - [List what API consumers would need to update]
   - [List which endpoints are affected]

   This requires your explicit approval before I can proceed.

   Would you like me to:
   1. Proceed with the breaking change
   2. Find a backwards-compatible alternative
   3. Cancel this change
   ```

3. **WAIT** for explicit user approval before continuing

### 4. Only Proceed After Approval

Only after the user has explicitly approved the breaking change should you implement it.

## Safe Alternatives to Consider

When a breaking change is detected, suggest backwards-compatible alternatives:

- **Adding fields**: Safe (add new optional fields to responses)
- **Deprecation**: Add new endpoint/field, mark old as deprecated
- **Default values**: Provide sensible defaults for new required fields

## Examples

### ❌ Breaking Change (Requires Approval)

```typescript
// Before
type APIResponse = {
  userId: string;
  name: string;
};

// After - BREAKING: removed userId field
type APIResponse = {
  id: string; // renamed from userId
  name: string;
};
```

### ✅ Safe Change (No Approval Needed)

```typescript
// Before
type APIResponse = {
  userId: string;
  name: string;
};

// After - SAFE: added optional field
type APIResponse = {
  userId: string;
  name: string;
  email?: string; // new optional field
};
```

### ✅ Backwards Compatible Alternative

```typescript
// SAFE: Keep old field, add new one
type APIResponse = {
  userId: string; // kept for backwards compatibility
  id: string; // new field
  name: string;
};
```

## When This Skill Applies

This rule applies automatically whenever you are:

- Modifying files in `front/pages/api/**` or `front/app/api/**`
- Changing type definitions that are exported and used in API responses
- Updating validation schemas used by API endpoints
- Refactoring code that affects API contracts

You don't need to manually invoke this skill - these guidelines should be followed automatically for any API-related work.
