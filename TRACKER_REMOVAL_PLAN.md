# Trackers Feature Removal Plan

**Date Created:** 2025-11-04  
**Last Updated:** 2025-11-13
**Branch:** `claude/remove-trackers-ui-011CUoXitSPm2L5qsr7Q3Pzd`

---

## Overview

This document provides a complete, step-by-step plan to remove the "trackers" feature from the Dust codebase. The trackers feature is a document change monitoring and AI suggestion system currently in "rolling out" stage behind the `labs_trackers` feature flag.

### What the Trackers Feature Does
- Monitors "watched" data sources for document changes
- Uses AI to suggest updates to "maintained" tracked documents
- Sends periodic email notifications with suggested changes
- Runs via Temporal workflows triggered on document upserts

---

## Pre-Deletion Checklist

- [ ] Verify no production workspaces are actively using trackers
- [ ] Backup production database (if applicable)
- [ ] Stop all running Temporal workflows for trackers
- [ ] Notify stakeholders (Henry or eng oncall per feature flag comment)
- [ ] Create feature branch: `claude/remove-trackers-ui-011CUoXitSPm2L5qsr7Q3Pzd`

---

## Status Snapshot (vs origin/main)

Use this to quickly see what’s already removed on this branch.

Verification command:

```
git fetch origin --prune
git diff --name-status origin/main...HEAD | sort
```

Summary as of 2025-11-13:
- Frontend UI and pages for trackers have been removed (files deleted) and the Poke page no longer renders the Trackers tab.
- API routes, SWR hooks, resources/models, Temporal code, feature flag, and types are still present.

---

## Deletion Strategy

**Approach:** Top-down deletion (UI → API → Backend → Database)

**Order of Operations:**
1. Frontend UI (components, pages)
2. API Routes
3. Document Upsert Hooks
4. Temporal Workflows & Activities
5. Backend Resources & Models
6. SWR Hooks & Utilities
7. Types & Interfaces
8. Database Migrations (create down migration)
9. Feature Flag & Configuration
10. Scripts, Tests, and Miscellaneous

---

## Phase 1: Frontend UI Components

### Delete Component Files

- [x] `front/components/trackers/TrackerBuilder.tsx`
- [x] `front/components/trackers/TrackerBuilderDataSourceModal.tsx`
- [x] `front/components/trackers/TrackerDataSourceSelectedTree.tsx`
- [x] `front/components/poke/trackers/columns.tsx`
- [x] `front/components/poke/trackers/table.tsx`

**Action:** Delete entire `front/components/trackers/` directory
**Action:** Delete entire `front/components/poke/trackers/` directory

### Delete Page Files

- [x] `front/pages/w/[wId]/labs/trackers/index.tsx` (list trackers)

Note: The Poke workspace page `front/pages/poke/[wId]/index.tsx` was updated to remove the Trackers tab and import.
- [x] `front/pages/w/[wId]/labs/trackers/new.tsx` (create tracker)
- [x] `front/pages/w/[wId]/labs/trackers/[tId]/index.tsx` (edit tracker)
- [x] `front/pages/poke/[wId]/trackers/[tId]/index.tsx` (admin view)

**Action:** Delete entire `front/pages/w/[wId]/labs/trackers/` directory
**Action:** Delete entire `front/pages/poke/[wId]/trackers/` directory

---

## Phase 2: API Routes

### Delete API Endpoint Files

- [ ] `front/pages/api/w/[wId]/spaces/[spaceId]/trackers/index.ts`
  - **Methods:** GET (list trackers), POST (create tracker)

- [ ] `front/pages/api/w/[wId]/spaces/[spaceId]/trackers/[tId]/index.ts`
  - **Methods:** PATCH (update tracker), DELETE (delete tracker)

- [ ] `front/pages/api/poke/workspaces/[wId]/trackers/index.ts`
  - **Methods:** Admin list trackers

- [ ] `front/pages/api/poke/workspaces/[wId]/trackers/[tId].ts`
  - **Methods:** Admin view tracker

**Action:** Delete entire `front/pages/api/w/[wId]/spaces/[spaceId]/trackers/` directory
**Action:** Delete entire `front/pages/api/poke/workspaces/[wId]/trackers/` directory

---

## Phase 3: Document Upsert Hooks

### Delete Document Upsert Hook Files

- [ ] `front/lib/document_upsert_hooks/hooks/tracker/index.ts`
  - **Contains:** `trackerUpsertHook` registration

- [ ] `front/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_retrieval.ts`
  - **Contains:** `callDocTrackerRetrievalAction()` - semantic search in maintained scope

- [ ] `front/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_score_docs.ts`
  - **Contains:** `callDocTrackerScoreDocsAction()` - relevance scoring

- [ ] `front/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_suggest_changes.ts`
  - **Contains:** `callDocTrackerSuggestChangesAction()` - LLM change generation

**Action:** Delete entire `front/lib/document_upsert_hooks/hooks/tracker/` directory

### Unregister Hook

- [ ] Find where `trackerUpsertHook` is registered in the document upsert pipeline
  - **Location:** `front/lib/document_upsert_hooks/hooks/index.ts`
  - **Action:** Remove tracker hook from registration array/map

---

## Phase 4: Temporal Workflows & Activities

### Delete Temporal Workflow Files

- [ ] `front/temporal/tracker/workflows.ts`
  - **Contains:**
    - `trackersGenerationWorkflow()` - triggered on document upsert
    - `trackersNotificationsWorkflow()` - hourly cron (0 * * * *)
    - `processTrackerNotificationWorkflow()` - per-tracker child workflow

- [ ] `front/temporal/tracker/activities.ts`
  - **Contains:**
    - `trackersGenerationActivity()` - main generation pipeline
    - `shouldRunTrackersActivity()` - check if should run
    - `getDebounceMsActivity()` - debounce timing
    - `getTrackerIdsToNotifyActivity()` - fetch trackers to notify
    - `processTrackerNotificationWorkflowActivity()` - send emails

- [ ] `front/temporal/tracker/client.ts`
  - **Contains:**
    - `launchTrackersGenerationWorkflow()`
    - `launchTrackerNotificationWorkflow()`
    - `stopTrackerNotificationWorkflow()`

- [ ] `front/temporal/tracker/config.ts`
  - **Contains:** Queue names:
    - `RUN_QUEUE_NAME: "document-tracker-queue-v3"`
    - `TRACKER_NOTIFICATION_QUEUE_NAME: "document-tracker-notify-queue-v1"`

- [ ] `front/temporal/tracker/signals.ts`
  - **Contains:**
    - `newUpsertSignal`
    - `notifySignal`

- [ ] `front/temporal/tracker/admin/cli.ts`
  - **Contains:** Admin CLI tools for tracker management

**Action:** Delete entire `front/temporal/tracker/` directory

### Stop Running Workflows

**CRITICAL:** Before deleting workflow code, ensure all running workflows are terminated.

- [ ] Check for running tracker workflows in Temporal UI/admin
- [ ] Terminate `trackersNotificationsWorkflow` (hourly cron)
- [ ] Terminate any active `trackersGenerationWorkflow` instances
- [ ] Verify no workflows in tracker queues:
  - `document-tracker-queue-v3`
  - `document-tracker-notify-queue-v1`

---

## Phase 5: Backend Resources & Models

### Delete Resource Files

- [ ] `front/lib/resources/tracker_resource.ts`
  - **Contains:** `TrackerConfigurationResource` class
  - **Key methods:** makeNew, updateConfig, fetchById, listBySpace, addGeneration, etc.

### Delete Model Files

- [ ] `front/lib/models/doc_tracker.ts`
  - **Contains:**
    - `TrackerConfigurationModel`
    - `TrackerDataSourceConfigurationModel`
    - `TrackerGenerationModel`

---

## Phase 6: SWR Hooks & Utilities

### Delete SWR Hook Files

- [ ] `front/lib/swr/trackers.ts`
  - **Contains:** `useTrackers()` hook

- [ ] `front/poke/swr/trackers.ts`
  - **Contains:** Admin-specific SWR hooks

### Delete Utility Files

- [ ] `front/lib/api/tracker.ts`
  - **Contains:**
    - `processTrackerNotification()` - email notification logic
    - `sendTrackerDefaultEmail()` - "no updates" email
    - `sendTrackerWithGenerationEmail()` - email with suggestions

---

## Phase 7: Types & Interfaces

### Delete Type Files

- [ ] `front/types/tracker.ts`
  - **Contains:**
    - `TrackerConfigurationType`
    - `TrackerDataSourceConfigurationType`
    - `TrackerConfigurationStateType`
    - `TrackerStatus`
    - `TrackerIdWorkspaceId`
    - `TrackerDataSource`
    - `TrackerGenerationToProcess`
    - `TRACKER_FREQUENCIES`

### Remove Type Imports

- [ ] Search codebase for imports from `types/tracker.ts`
- [ ] Remove any remaining imports (should be none if above phases completed)

**Verification Command:**
```bash
grep -r "from.*types/tracker" front/ --include="*.ts" --include="*.tsx"
```

---

## Phase 8: Database Migrations

### Create Down Migration

- [ ] Create new migration file: `migration_XXX_drop_tracker_tables.sql`

**Migration Content:**
```sql
-- Drop tracker tables (reverse order of creation due to foreign keys)
DROP TABLE IF EXISTS tracker_generations CASCADE;
DROP TABLE IF EXISTS tracker_data_source_configurations CASCADE;
DROP TABLE IF EXISTS tracker_configurations CASCADE;

-- Note: Existing migrations 126, 127, 130, 135, 138, 140, 147, 148, 265, 267, 364
-- created and modified these tables. This migration removes them entirely.
```

### Migration Files to Reference (DO NOT DELETE - historical record)

- [ ] `front/migrations/db/migration_126.sql` - Initial table creation
- [ ] `front/migrations/db/migration_127.sql` - Added name and description
- [ ] `front/migrations/db/migration_130.sql` - Added lastNotifiedAt and consumedAt
- [ ] `front/migrations/db/migration_135.sql` - Added skipEmptyEmails
- [ ] `front/migrations/db/migration_138.sql` - Added indexes on data source IDs
- [ ] `front/migrations/db/migration_140.sql` - Added maintainedDocumentId
- [ ] `front/migrations/db/migration_147.sql` - Added workspaceId
- [ ] `front/migrations/db/migration_148.sql` - Backfill workspace IDs
- [ ] `front/migrations/db/migration_265.sql` - Added compound indexes
- [ ] `front/migrations/db/migration_267.sql` - Added workspace/tracker/scope index
- [ ] `front/migrations/db/migration_364.sql` - Added workspace index on generations

**Note:** Keep historical migrations for reference. The new down migration will handle cleanup.

### Run Migration

- [ ] Test migration in development environment
- [ ] Run migration in staging (if applicable)
- [ ] Run migration in production (coordinate with team)

---

## Phase 9: Feature Flag & Configuration

### Remove Feature Flag

- [ ] Edit `front/types/shared/feature_flags.ts`
  - **Remove:** `labs_trackers` flag definition

**Current Definition:**
```typescript
labs_trackers: {
  description: "Tracker feature. Check with Henry or eng oncall before activating to a new workspace.",
  stage: "rolling_out"
}
```

### Remove Configuration Constants

- [ ] Search for `TRACKER_LIMIT_BY_WORKSPACE` and remove
- [ ] Search for tracker-specific environment variables
- [ ] Remove tracker queue names from Temporal configuration (if centrally defined)

**Search Commands:**
```bash
grep -r "TRACKER_LIMIT_BY_WORKSPACE" front/
grep -r "labs_trackers" front/ --include="*.ts" --include="*.tsx"
grep -r "document-tracker-queue" front/
```

---

## Phase 10: Scripts, Tests, and Miscellaneous

### Delete Script Files

- [ ] `front/scripts/send_tracker_generations.ts`
  - **Purpose:** Manual script to send tracker generations

### Remove Test Cases

- [ ] Search for tracker-related tests in `front/pages/api/v1/w/[wId]/feature_flags.test.ts`
  - **Action:** Remove test cases for `labs_trackers` feature flag

- [ ] Search for other tracker tests:
```bash
grep -r "tracker" front/ --include="*.test.ts" --include="*.test.tsx"
```

### Clean Up Miscellaneous References

- [ ] Check `front/components/app/PostHogTracker.tsx` for tracker analytics
  - **Note:** This is likely a generic analytics component, not tracker-specific

- [ ] Check `front/lib/utils/url-to-poke.ts` for tracker poke links

- [ ] Check `front/lib/registry.ts` for Dust action registry entries:
  - `doc-tracker-retrieval`
  - `doc-tracker-score-docs`
  - `doc-tracker-suggest-changes`

### Search for Remaining References

- [ ] Global search for "tracker" references:
```bash
grep -ri "tracker" front/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

- [ ] Review results and remove tracker-specific code
  - **Note:** May find false positives like "PostHogTracker" (analytics), keep those

---

## Phase 11: Code Cleanup & Verification

### Remove Dead Imports

- [ ] Search for imports from deleted files:
```bash
# After deletions, check for broken imports
npm run type-check
# or
pnpm type-check
```

### Fix TypeScript Errors

- [ ] Fix any compilation errors from removed types/imports
- [ ] Ensure no references to `TrackerConfigurationType` or related types

### Remove Unused Dependencies

- [ ] Check if any npm packages were tracker-specific
- [ ] Review `package.json` for tracker-related dependencies (unlikely)

---

## Phase 12: Final Verification

### Code Verification

- [ ] Run TypeScript compiler: `npm run type-check` or `tsc --noEmit`
- [ ] Run linter: `npm run lint` or `eslint .`
- [ ] Run tests: `npm test` or `jest`
- [ ] Build project: `npm run build`

### Runtime Verification

- [ ] Start development server
- [ ] Verify no 404s or errors in browser console
- [ ] Check that workspaces load correctly
- [ ] Verify poke/admin pages load without errors

### Database Verification

- [ ] Confirm tracker tables are dropped:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE '%tracker%';
```

- [ ] Verify no foreign key constraints reference tracker tables

### Search for Lingering References

- [ ] Final global search:
```bash
grep -ri "tracker" front/src front/pages front/components front/lib --include="*.ts" --include="*.tsx" | grep -v "PostHogTracker" | grep -v "error_tracker"
```

- [ ] Review any remaining references to ensure they're not tracker-feature related

---

## Phase 13: Git & Deployment

### Commit Changes

- [ ] Stage all deletions:
```bash
git add -A
```

- [ ] Commit with descriptive message:
```bash
git commit -m "feat: Remove trackers feature entirely

- Deleted all tracker UI components and pages
- Removed tracker API endpoints
- Removed tracker Temporal workflows and activities
- Removed tracker document upsert hooks
- Deleted tracker models, resources, and types
- Created migration to drop tracker database tables
- Removed labs_trackers feature flag
- Cleaned up tracker-related utilities and scripts

Refs: TRACKER_REMOVAL_PLAN.md"
```

### Push to Remote

- [ ] Push to feature branch:
```bash
git push -u origin claude/remove-trackers-ui-011CUoXitSPm2L5qsr7Q3Pzd
```

### Create Pull Request

- [ ] Create PR with title: "Remove trackers feature entirely"
- [ ] Add description referencing this removal plan
- [ ] Request review from Henry or eng oncall (per feature flag comment)
- [ ] Add label: breaking-change (if applicable)

---

## Rollback Plan

If issues arise, rollback procedure:

1. **Revert Git Commit:**
   ```bash
   git revert HEAD
   git push
   ```

2. **Restore Database Tables:**
   - Run original migrations 126-364 in order
   - Restore from database backup if data recovery needed

3. **Verify Temporal Workflows:**
   - Check if workflows need to be restarted
   - Verify queue configurations

---

## Post-Deletion Tasks

### Documentation Updates

- [ ] Update any architecture documentation mentioning trackers
- [ ] Update feature flag documentation
- [ ] Update API documentation if it referenced tracker endpoints

### Communication

- [ ] Notify team of tracker removal
- [ ] Update any user-facing documentation
- [ ] Announce in relevant Slack channels

### Monitoring

- [ ] Monitor error logs for 24-48 hours after deployment
- [ ] Watch for any unexpected 404s or broken references
- [ ] Check Temporal UI for orphaned workflows

---

## Summary Statistics

**Estimated Files to Delete:** ~40 files
**Estimated Directories to Remove:** 7 directories
**Database Tables to Drop:** 3 tables
**Database Migrations Referenced:** 11 migrations
**API Endpoints Removed:** 4 endpoints
**Temporal Workflows Removed:** 3 workflows
**Temporal Activities Removed:** 5 activities

---

## Important Notes

⚠️ **CRITICAL:**
- Stop all running Temporal workflows BEFORE deleting code
- Coordinate with Henry or eng oncall before execution
- Test in development/staging before production deployment
- Keep historical migrations for reference (don't delete migration_126.sql etc.)

✅ **SAFE:**
- No other features depend on trackers (isolated feature)
- Feature is behind feature flag (limited exposure)
- All tracker code is self-contained in dedicated directories

---

## File Checklist Summary

### Directories to Delete (7)
- [x] `front/components/trackers/`
- [ ] `front/components/poke/trackers/`
- [x] `front/pages/w/[wId]/labs/trackers/`
- [x] `front/pages/poke/[wId]/trackers/`
- [ ] `front/pages/api/w/[wId]/spaces/[spaceId]/trackers/`
- [ ] `front/pages/api/poke/workspaces/[wId]/trackers/`
- [ ] `front/temporal/tracker/`
- [ ] `front/lib/document_upsert_hooks/hooks/tracker/`

### Individual Files to Delete (9)
- [ ] `front/lib/resources/tracker_resource.ts`
- [ ] `front/lib/models/doc_tracker.ts`
- [ ] `front/lib/swr/trackers.ts`
- [ ] `front/poke/swr/trackers.ts`
- [ ] `front/lib/api/tracker.ts`
- [ ] `front/types/tracker.ts`
- [ ] `front/scripts/send_tracker_generations.ts`

### Files to Modify (2+)
- [ ] `front/types/shared/feature_flags.ts` (remove `labs_trackers`)
- [ ] Document upsert hook registry (unregister `trackerUpsertHook`)
- [ ] Any remaining files with tracker imports/references

### New Files to Create (1)
- [ ] `front/migrations/db/migration_XXX_drop_tracker_tables.sql`

---

## Completion Checklist

- [ ] All phases (1-13) completed
- [ ] All verification steps passed
- [ ] Changes committed and pushed
- [ ] Pull request created and reviewed
- [ ] Migration run successfully
- [ ] Production deployment completed
- [ ] Post-deletion monitoring completed (24-48 hours)
- [ ] Documentation updated
- [ ] Team notified

---

**Plan Status:** Ready for Execution
**Estimated Time:** 3-4 hours (development) + review time
**Risk Level:** Low (isolated feature, feature-flagged)

---

*End of Tracker Removal Plan*
