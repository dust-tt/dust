---
name: dust-swagger
description: MANDATORY guideline - Always keep Swagger documentation in sync when modifying API endpoints or schemas.
---

# Swagger Documentation Sync - Mandatory Rule

**MANDATORY**: Any change to an API endpoint schema must be reflected in the Swagger documentation. Do not consider an API change complete until Swagger is updated.

## When This Rule Applies

Automatically applies whenever you are:

- Modifying files in `front/pages/api/**` or `front/app/api/**`
- Adding, removing, or renaming fields in request/response bodies (at any nesting level)
- Changing field types or optionality in API schemas
- Adding or removing endpoints

## What to Update

When modifying API schemas, check and update the following:

- `pages/api/swagger_private_schemas.ts` — shared schemas for the private API
- `pages/api/v1/w/[wId]/swagger_schemas.ts` — shared schemas for the public API
- The `@swagger` annotation in the endpoint file itself

## Annotations

- Every endpoint must have either a `@swagger` annotation (with proper documentation) or `@ignoreswagger` (for internal/undocumented endpoints). This is enforced by the `lint:swagger-annotations` check.
- TypeScript types annotated with `@swaggerschema` point to a corresponding swagger schema. When modifying such a type, always update the referenced schema.

Example:

```typescript
/**
 * @swaggerschema PrivateUser (swagger_private_schemas.ts)
 */
export type UserTypeWithWorkspaces = UserType & {
  workspaces: WorkspaceType[];
};
```

## Process

1. Make the API/type change
2. Identify which swagger files reference the modified schema
3. Update all relevant `@swagger` annotations and shared schema files
4. Verify `lint:swagger-annotations` passes

You don't need to manually invoke this skill - these guidelines should be followed automatically for any API-related work.
