---
tags: [lint, api]
level: error
---

# No `privateApiError` outside private route files

`privateApiError` lets a handler omit `message`. The public API (`front-api/routes/v1/**`) and the
middlewares and helpers shared with it (`front-api/middlewares/**`, `front-api/lib/**`) must use
`apiError`, whose type requires `message`.

```grit
language js

`privateApiError($...)` => `PRIVATE_API_ERROR_FORBIDDEN`
```

## Should flag `privateApiError` calls

```typescript
privateApiError(c, { status_code: 404, api_error: { type: "user_not_found" } });
```

```typescript
PRIVATE_API_ERROR_FORBIDDEN;
```

## Should not flag `apiError` calls

```typescript
apiError(c, {
  status_code: 404,
  api_error: { type: "user_not_found", message: "The user was not found." },
});
```
