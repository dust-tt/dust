-- Migration created on Jan 14, 2026
-- Create workspace_domain_use_cases table for managing domain use cases
-- (e.g., SSO auto-join, MCP static IP egress)

CREATE TABLE IF NOT EXISTS "workspace_domain_use_cases" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "domain" VARCHAR(255) NOT NULL,
    "useCase" VARCHAR(255) NOT NULL,
    "status" VARCHAR(255) NOT NULL DEFAULT 'pending'
);

-- Unique constraint: one entry per (workspace, domain, useCase)
CREATE UNIQUE INDEX "workspace_domain_use_cases_unique_idx" ON "workspace_domain_use_cases" ("workspaceId", "domain", "useCase");

-- For lookups by workspace and use case (e.g., find all MCP domains)
CREATE INDEX CONCURRENTLY "workspace_domain_use_cases_workspace_use_case_idx" ON "workspace_domain_use_cases" ("workspaceId", "useCase");

-- For lookups by workspace and domain (e.g., find all use cases for a domain)
CREATE INDEX CONCURRENTLY "workspace_domain_use_cases_workspace_domain_idx" ON "workspace_domain_use_cases" ("workspaceId", "domain");
