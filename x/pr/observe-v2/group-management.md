# Scoped Usage manager

## Goal

Team leads need to adjust their members' credit allowances without asking a workspace administrator
each time. Today, this requires the workspace manager or admin role, which gives authority across the
whole workspace.

We will let administrators delegate usage management for selected teams. A team is an existing manual
or provisioned group. The pilot changes who can manage existing limits; spending rules stay the same.

## What

### Assign Usage managers to a group

In the existing group management UI, workspace admins select people in a new **Usage managers**
setting. A group can have several Usage managers, and a person can manage several groups. They must
be active workspace members, but do not need to belong to the groups they manage.

This assignment grants three capabilities:

- View usage and limits for the group's current members.
- Edit those members' personal limits.
- Edit the group's existing per-member allowance.

It does not change the person's workspace role or group membership. Workspace managers and admins
keep their existing workspace-wide access.

For example, Alice can manage usage for Support while remaining an ordinary workspace member. She
can adjust a Support member's allowance, but cannot change limits for someone who belongs only to
Sales.

### Reuse the Usage page

Delegates get access to the existing **Usage** navigation entry and URL. The page shows a restricted
view, with a short explanation such as “You manage usage for Support and Sales.”

| Part | Delegate experience |
| --- | --- |
| Members tab | Members of managed groups, with consumption, effective limit, its source, and an edit action. Members appearing in several groups appear only once. |
| Group filter | “All groups you manage” and each managed group. Clearing a filter never reveals the rest of the workspace. |
| Groups tab | Managed groups and their editable per-member allowances. |
| Personal-limit editor | Editable personal limit and allowances for groups the delegate manages. Other inherited settings are read-only explanations. |
| Other sections | Workspace settings, purchases, seat changes, and workspace-wide reporting are unavailable through this role. |

Only authorized administration entries appear in navigation. Other permissions a person already
holds continue to apply.

### Keep the meaning of limits unchanged

A group allowance applies to each member; it is not a shared budget. A personal override takes
precedence over group allowances. Without an override, the highest configured group allowance wins,
then the workspace default if no group allowance applies.

Personal edits remain ongoing and apply across the workspace. The editor states: **“This personal
limit applies across the workspace.”** Raising a limit allows more consumption; it does not purchase
or reserve credits.

## Technical design

### 1. Store delegation in existing grants

Extend the [permission vocabulary](../../../front/types/group_permissions.ts) and
[role registry](../../../front/lib/resources/group_permission_registry.ts) with a `group` resource type
and a `usage_manager` role. The proposed verbs are `read_usage`, `set_member_limit`, and
`set_group_limit`. Append new verbs to preserve the existing serialized permission bit positions.

The pilot creates grants on specific group IDs. Named individuals use the existing
`GroupPermissionResource.grantToUsers` and `revokeFromUsers` helpers: an internal automatic group
contains the delegates and holds the grant on the target group. For example:

```text
Internal group containing Alice → usage_manager → Support group
```

The grant holder and the managed group are different things. Granting the role to Support itself
would give every Support member management authority.

Update [GroupResource](../../../front/lib/resources/group_resource.ts) to combine these grants with its
existing role permissions. Apply usage permissions only to manual and provisioned groups. Keep
membership editing and deletion under their existing rules, including directory-owned membership
for provisioned groups. The three new verbs do not grant those actions.

No new permission table or budget fields are needed. Update the group permission contracts to
describe the added verbs and preserve the existing membership rules.

### 2. Manage assignments and discover access

Add an admin-only GET/PUT endpoint at `/api/w/:wId/groups/:groupId/usage-managers`. It reads or replaces
the named delegates for one eligible group. Validate active workspace membership and apply additions
and removals transactionally through the grant resource.

Add a small `/api/w/:wId/credits/usage-access` response describing whether the caller has workspace
access, access to named groups, or no usage-management access. Navigation and the Usage page use it
to choose the view. It is a UI description, not a substitute for authorization on subsequent requests.

Use [Authenticator](../../../front/lib/auth.ts) to resolve group grants. Handle workspace manager/admin
access explicitly: grant enumeration does not include access derived from workspace roles. A
type-wide grant must resolve to all eligible groups rather than an empty group list.

### 3. Authorize reads and writes in shared services

Centralize the following checks so routes and background callers use the same rules:

| Operation | Required authority |
| --- | --- |
| Read a member's usage | Workspace manager/admin, or `read_usage` on a group containing that active member. |
| Set or clear a personal limit | Workspace manager/admin, or `set_member_limit` on a group containing that active member. |
| Set or clear a group allowance | Workspace manager/admin, or `set_group_limit` on that group. |

Check workspace ownership, current delegation, and active membership on the server. A submitted group
or user ID is never evidence of authority. Use existing cache invalidation when assignments change;
clean up grants and their internal groups when the managed group is deleted.

For [member usage reads](../../../front/lib/api/credits/members_usage.ts), restrict the candidate members
to the authorized set before search, sorting, pagination, and counts. Intersect user-selected filters
with that set. Reuse this scope for any member lookup used by the editor.

Replace the role-only gates on the relevant individual read/write routes with these checks. Enforce
write authorization inside [setUserSpendLimit](../../../front/lib/api/users/spend_limit.ts) and
[setGroupSpendLimit](../../../front/lib/api/groups/spend_limit.ts), before mutations. Keep existing value
validation, plan eligibility, persistence, and credit-state reconciliation. Stored pool allowances
continue to exclude the seat allowance, which existing code adds when computing the effective limit.

Bulk endpoints remain workspace-manager/admin-only in the pilot. Their workers also pass through
the shared mutation checks, using current authority when they execute.

### 4. Adapt the existing UI

Give the Usage route its own access guard in
[adminRoutes](../../../front-spa/src/app/routes/adminRoutes.tsx), allowing workspace managers/admins and
delegates. Keep the other route guards unchanged.

In [UsagePage](../../../front/components/pages/workspace/UsagePage.tsx), render a restricted view for
delegates, reusing the member/group tables and limit inputs. Keep workspace-only data hooks in the
workspace view so delegates do not fetch hidden sections. Use the usage-access response to populate
the group filter and navigation.

Pass explicit edit permissions to the personal-limit modal. Each group field needs its own check:
authority over a member does not grant authority over every group that member belongs to. Server
checks remain decisive if the page becomes stale.

### 5. Audit, verify, and release

Audit assignment changes. Extend existing limit-change events to record the previous/new setting
and the server-verified group authorizing a delegated change, alongside the actor and target.

Use a workspace feature flag for the pilot, checked on the server as well as in the UI. When disabled,
delegated access is unavailable while existing workspace-manager/admin access continues to work.

Focused tests cover allowed and denied reads/writes across two groups, an overlapping member,
assignment or membership removal, filtered counts, and existing workspace-manager/admin access.
Start with a few teams whose memberships overlap little.

## Annex

### Out of scope

- Shared team budgets, reserved credits, new spending ceilings, or new expiry behavior.
- Bulk actions and upgrade-request routing for delegates.
- Purchasing credits, changing seats, managing membership, or appointing other delegates.
- Creator/publisher delegation, custom roles, and selecting groups as delegates in the assignment UI.
- A separate Teams product area or general access to conversation content and analytics.

### Pilot compromises

**Personal limits have shared ownership.** If someone belongs to Support and Sales, either team's
delegate can edit the same personal limit, including a limit previously set by an admin. The last
successful edit applies. There is no additional financial ceiling for delegates beyond existing
validation. Delegates can also edit their own limit if they belong to a group they manage.

**Revocation stops future actions.** Removing an assignment or removing a member from a managed group
prevents future delegated edits through that group. It does not undo prior personal-limit changes.
A member's usage view covers their existing cycle usage, not just consumption since joining the team.

**Group changes may not change a member's effective limit.** A personal override or a higher allowance
from another group can still take precedence. Show the effective limit and its source after saving.

### Extension to other permissions

The same group-scoped grants can later support permission-management roles. Those roles must state
which capabilities a delegate may assign; having a capability does not imply authority to grant it.

For whole-group delegation, add or remove only that group's grant. The current Governance
`setGroups` operation replaces the workspace's entire recipient list and cannot be reused unchanged.
For individual selections, retain the originating team and remove team-derived access when membership
ends. Grants from other groups still apply: removing one team's grant is not a global denial.
