# Group managers

Part of the [Observe & Understand Credits v2](https://app.notion.com/p/dust-tt/Observe-Understand-Credits-v2-3dc28599d94180f3b417ca4579ad3992) initiative.

Implementation breakdown: [work streams and PRs](group-management-plan.md).

## Goal

Team leads need to manage their teams' membership and credit allowances without asking a workspace
administrator each time. Today, this requires the workspace manager or admin role, which gives
authority across the whole workspace.

We will let administrators appoint group managers for selected teams. A team is an existing manual
or provisioned group. This work delegates existing membership and limit controls; spending rules stay
the same, and provisioned membership remains owned by the directory.

## What

### Assign group managers

In the existing group management UI, workspace admins select people in a new **Group managers**
setting. A group can have several group managers, and a person can manage several groups. They must
be active workspace members, but do not need to belong to the groups they manage.

This assignment lets group managers:

- View usage and limits for the group's current members.
- Edit those members' personal limits.
- Edit the group's existing per-member allowance.
- Handle usage-limit requests from the group's current members.
- Add existing workspace members to a managed manual group, or remove them from it.

The assignment itself does not change the person's workspace role or group membership. Managing
membership includes granting or removing the group's access, workspace roles, and seats, including
for oneself. The assignment UI states this explicitly. Workspace managers and admins keep their
existing workspace-wide access.

For example, Alice can manage Support while remaining an ordinary workspace member. She can add an
existing colleague to the manual Support group and adjust a Support member's allowance. She cannot
edit Sales or change limits for someone who belongs only to Sales.

### Confirm appointments outside the group

When saving a new manager for a manual group, show a confirmation if the person is not already an
active member of that group. List the group's configured workspace roles, governance permissions,
and seats in familiar language, such as “Workspace admin”, “Access billing features”, and “Publish
agents”. For example:

> **Appoint Alex as a group manager?**
>
> Alex is not a member of Finance. As a group manager, they can add themselves or others and give
> them the access this group grants, including:
>
> - Access billing features
> - Publish agents
>
> Appoint Alex only if you trust them to receive and grant this access. Removing their manager role
> later will not undo access they have already granted.
>
> **Cancel** · **Appoint manager**

Show only permissions actually configured for the group, and also mention access to resources shared
with it. If no extra roles, governance permissions, or seats are configured, say so and keep the
membership/access explanation. When several new managers need confirmation, list them in one modal.
Cancel saves nothing; confirmation submits the pending changes.

Existing group members skip this modal. The manager picker still explains that managing membership
means deciding who receives the group's access. Provisioned groups skip this membership warning:
their managers cannot edit membership or add themselves through Dust.

### Open the People page to group managers

Group managers get access to the existing **People** page, with a restricted view:

- **Members:** people in their managed groups, with actions to add or remove membership in those
  groups. Removing someone from a group does not remove them from the workspace.
- **Groups:** their managed groups and their members. Manual groups have add/remove controls;
  provisioned groups explain that membership is managed in the identity provider.
- **Add members:** search existing active workspace members, including people outside the managed
  groups. Results show only the identity information needed to select someone, not their usage.

Direct role and seat changes, workspace invitations, group creation/deletion, and appointing group
managers keep their existing workspace-level authorization. Group managers can change membership of
any manual group they manage, including groups granting admin/manager roles, billing/security access,
or paid seats. They cannot directly change what the group grants. The tradeoff is described in the Annex.

### Reuse the Usage page

Group managers get access to the existing **Usage** navigation entry and URL. The page shows a
restricted view, with a short explanation such as “You manage usage for Support and Sales.”

| Part | Group manager experience |
| --- | --- |
| Members tab | Members of managed groups, with consumption, effective limit, its source, and an edit action. Members appearing in several groups appear only once. |
| Group filter | “All groups you manage” and each managed group. Clearing a filter never reveals the rest of the workspace. |
| Groups tab | Managed groups and their editable per-member allowances. |
| Requests list | Requests from managed members, with actions to edit the limit and approve, or deny. Request counts and filters use the same scope. |
| Personal-limit editor | Editable personal limit and managed groups' allowances. Other inherited settings are read-only explanations. |
| Other sections | Workspace settings, purchases, seat changes, and workspace-wide reporting are unavailable through this role. |

Only authorized administration entries appear in navigation. Other permissions a person already
holds continue to apply.

Handling requests uses the same `set_usage_limits` permission as editing limits. A group manager
approves through the existing limit editor: save the limit, then mark the request approved. Denial
only changes the request status. The seat-upgrade action keeps its existing authorization.
When a requester belongs to several managed groups, their request appears once; any authorized
manager can resolve it. Request email notifications keep their current recipients.

### Keep the meaning of limits unchanged

This work preserves the existing behavior:

- A group allowance applies to each member; it is not a shared budget. A personal override takes
  precedence over group allowances. Without an override, the highest configured group allowance wins,
  then the workspace default if no group allowance applies.
- Personal edits remain ongoing and apply across the workspace. The editor states: **“This personal
  limit applies across the workspace.”** Raising a limit allows more consumption; it does not purchase
  or reserve credits.

## Technical design

### 1. Store delegation in existing grants

Extend the [permission vocabulary](../../../front/types/group_permissions.ts) and
[role registry](../../../front/lib/resources/group_permission_registry.ts) with a `group` resource type
and a `group_manager` role. It bundles existing `read` and `write` permissions with two new verbs:
`read_usage` and `set_usage_limits`. The latter covers personal limits, group allowances, and handling
usage-limit requests.
Append new verbs to preserve the existing serialized permission bit positions.

This work creates grants on specific group IDs. Named individuals use the existing
`GroupPermissionResource.grantToUsers` and `revokeFromUsers` helpers: an internal automatic group
contains the delegates and holds the grant on the target group. For example:

```text
Internal group containing Alice → group_manager → Support group
```

The grant holder and the managed group are different things. Granting the role to Support itself
would give every Support member management authority.

Update [GroupResource](../../../front/lib/resources/group_resource.ts) to combine these grants with its
existing role permissions. Apply usage permissions only to manual and provisioned groups. Reuse
`write` for manual-group membership changes; filter it out for provisioned groups. Renaming and
deleting groups continue to require `admin` on the group, which this role does not grant. Update the
verb contracts to make these boundaries explicit.

No new permission table or budget fields are needed. Update the group permission contracts to
describe the added verbs and the membership restrictions.

### 2. Manage assignments and discover access

Extend the existing GET/PATCH `/api/w/:wId/groups/:groupId` management API with `managerIds`.
PATCH changes only supplied fields: `managerIds` replaces the manager list, omission leaves it alone,
and an empty list revokes all assignments. Only workspace admins may change this field. Validate
active workspace membership and apply additions/removals through the grant resource in a transaction.
Keep this path separate from manual membership updates so provisioned groups can also have managers.
Check all supplied fields before applying any part of a patch.

Use [Authenticator](../../../front/lib/auth.ts) directly to resolve scope: workspace managers/admins
have workspace access; otherwise call `auth.getResourceIdsWithVerb("group", verb)`. The result is
`{ kind: "all" }` or `{ kind: "ids", resourceIds }`, not a boolean. An empty ID list grants no access.
Resolve type-wide grants to eligible groups and apply each group's actual permission checks.

The server's `Authenticator` already resolves grants and answers `can` and `getResourceIdsWithVerb`.
The browser's `useAuth()` exposes serialized data rather than that server object, and currently
receives only workspace-level capabilities. Extend the existing
[auth-context response](../../../front/types/api/auth_context.ts) with the derived group-management scope,
using public group IDs. Include each group's allowed actions in the existing group response. Both
pages and navigation reuse this information, without a dedicated usage-access endpoint. Server
authorization remains decisive on every request.

### 3. Authorize reads and writes in shared services

Centralize the following checks so routes and background callers use the same rules. Each check asks
for the verb required by the action:

| Operation | Required authority |
| --- | --- |
| Read a member's usage | Workspace manager/admin, or `read_usage` on a group containing that active member. |
| Set or clear a personal limit | Workspace manager/admin, or `set_usage_limits` on a group containing that active member. |
| Set or clear a group allowance | Workspace manager/admin, or `set_usage_limits` on that group. |
| List, approve, or deny a usage-limit request | Workspace manager/admin, or `set_usage_limits` on a group containing the active requester. |
| Add/remove a group member | `write` on the target manual group; for an admin-granting group, workspace admin authority or an explicit membership delegation on that group. |

Check workspace ownership, current delegation, and active membership on the server. A submitted group
or user ID is never evidence of authority. Use existing cache invalidation when assignments change;
clean up grants and their internal groups when the managed group is deleted.

For [member usage reads](../../../front/lib/api/credits/members_usage.ts), restrict the candidate members
to the authorized set before search, sorting, pagination, and counts. Intersect user-selected filters
with that set. Apply the same restriction to the People members list and usage-editor lookups. The
People add-member search is deliberately broader: it returns minimal identities for active workspace
members, without exposing their usage or other administration data.

Replace the role-only gates on the relevant individual read/write routes with these checks. Enforce
write authorization inside [setUserSpendLimit](../../../front/lib/api/users/spend_limit.ts) and
[setGroupSpendLimit](../../../front/lib/api/groups/spend_limit.ts), before mutations. Keep existing value
validation, plan eligibility, persistence, and credit-state reconciliation. Stored pool allowances
continue to exclude the seat allowance, which existing code adds when computing the effective limit.

Apply the same scope to [upgrade requests](../../../front/lib/api/credits/upgrade_requests.ts), including
the resource-level guards that currently require a workspace manager. Filter requests and counts on
the server, and recheck current authority before resolving a request by ID. Saving a limit and
resolving a request remain separate operations, both authorized. If the second fails, show that the
limit was saved and refresh the request's status. Resolve only pending requests, with a conditional
update so two managers cannot resolve the same request twice.

For membership mutations, reuse `updateRegularManualGroupMembers` and the existing group/member
routes. Authorize the target group, not whether a new member already belongs to it. Keep active
workspace membership, last-member protection, self-lockout safeguards, role/seat synchronization, and
cache invalidation. Allow membership edits regardless of the group's granted roles, permissions, or
seats, including adding oneself.

Update the admin-group membership guard and the role-sync guard together: an explicit delegation on
an admin-granting group authorizes the resulting admin promotions and demotions. A workspace manager
without that delegation keeps the existing restriction. Carry the authorized group context into role
sync; editing an unrelated group must not authorize changes to someone's admin role. Direct role
assignment and changes to what a group grants retain their existing checks. Update the corresponding
security contracts and both membership-edit paths.

Bulk usage endpoints remain workspace-manager/admin-only. Their workers also pass through the shared
mutation checks, using current authority when they execute.

### 4. Adapt the existing UI

Give the People and Usage routes their own access guards in
[adminRoutes](../../../front-spa/src/app/routes/adminRoutes.tsx), allowing workspace managers/admins and
group managers. Keep the other route guards unchanged.

In [UsagePage](../../../front/components/pages/workspace/UsagePage.tsx), render a restricted view for
group managers, reusing the member/group tables and limit inputs. Do the same in
[MembersPage](../../../front/components/pages/workspace/MembersPage.tsx) for People. Keep workspace-only
data hooks and actions in the workspace views so group managers do not fetch hidden sections.
Use the auth-context scope and group permissions to populate filters, navigation, and edit controls.
Replace the admin-only read-only state in group dialogs with the actual membership authorization.
Explain in the manager picker and membership editor that membership carries the group's access,
roles, and seats.

Before submitting manager additions, compare them with current active group membership and show the
confirmation described above. Treat someone removed in the same edit as a non-member too; adding them
in the unsaved form does not make them an existing member. Use the existing group and Governance data
and permission labels for the summary. The modal is an explanation, not an authorization check:
assignment writes remain admin-only and the server validates every submitted field.

Pass explicit edit permissions to the personal-limit modal. Each group field needs its own check:
authority over a member does not grant authority over every group that member belongs to. Server
checks remain decisive if the page becomes stale.

Reuse the existing request list, denial action, and limit-editor approval flow. Do not expose seat
upgrades through the new role, and do not fetch workspace-wide requests before filtering them in the
browser.

### 5. Audit, verify, and release

Audit assignment changes. Extend existing limit-change events to record the previous/new setting
and the server-verified group authorizing a delegated change, alongside the actor and target. Reuse
the existing group membership and request-resolution audit events, recording the authorizing group
for delegated actions.

Use a workspace feature flag at the API and UI entry points. Keep permission definitions, generic
`Authenticator` methods, and grant storage free of flag conditions. APIs accept new manager
assignments and delegated access only when enabled; when disabled, existing workspace-role checks
still apply, including for callers who already have stored delegation grants.

Shared services always check authority. Preserve current role restrictions for MCP tools and bulk
workers, including the tools' admin-group protection and a fresh workspace-manager check when a bulk
job executes. These callers must not gain access through the new delegation while bypassing the API
rollout checks. Opening those entry points to group managers is outside this work.

Focused tests cover allowed and denied reads/writes across two groups, an overlapping member,
assignment or membership removal, filtered counts, and existing workspace-manager/admin access. Also
cover adding someone outside the current group, delegated changes in groups granting roles,
billing/security access, or seats, and self-addition. Reject provisioned membership edits and
admin-group edits by workspace managers without a delegation. Verify that role sync cannot change
admin roles through an unrelated group, and that requests respect membership changes and prior
resolution. Check the confirmation for non-members, its cancellation, and the existing-member and
provisioned-group cases. Check disabled-flag behavior with stored grants and the existing tool/worker
restrictions. Enable the feature gradually as these flows are validated.

## Annex

### Out of scope

- Shared team budgets, reserved credits, new spending ceilings, or new expiry behavior.
- Bulk usage actions and changes to request email/notification routing.
- Purchasing credits, directly changing seats or workspace roles, inviting/removing workspace
  members, renaming/deleting groups, or appointing other group managers through the new role.
- Creator/publisher delegation, custom roles, and selecting groups as delegates in the assignment UI.
- A separate Teams product area or general access to conversation content and analytics.

### Tradeoffs and membership effects

**Membership changes carry the group's existing grants.** Adding someone may give them access to
spaces and governance capabilities, as well as the group's usage allowance. It also extends the
group manager's usage authority to that person. Removing them removes group-derived access, but
grants from other groups still apply. A group merely containing admins does not make new members
admins: the group must itself grant that role.

**Managing membership means deciding who receives the group's privileges.** This is an explicit
choice: the same delegation applies to ordinary groups and groups granting workspace roles,
billing/security access, or paid seats. It gives admins one consistent way to delegate who receives
that access, without separate approval for each membership change.

The tradeoff is broad authority, with five consequences:

- **Self-promotion or a compromised account.** A manager of an admin-granting group can add themselves
  and become a workspace admin. Trust the delegate and their account as much as someone receiving
  those privileges directly; confirmation and audit logs cannot replace that trust.
- **Separation of duties.** Someone trusted to maintain a roster or handle usage requests may not be
  trusted to grant billing/security access. Keep organizational groups separate from groups granting
  sensitive permissions when those decisions need different owners.
- **Authority can grow later.** Adding privileges to a group also expands what its existing managers
  can distribute. Review its managers whenever its grants expand; the appointment-time warning does
  not cover future changes.
- **Costs and access disruption.** Adding members can allocate paid seats; removing members can
  withdraw critical access or demote admins. Delegate these groups only to people trusted with those
  purchasing and access decisions, and retain a way for admins to recover access.
- **Revocation is not an undo button.** Removing the manager assignment leaves previous membership
  changes and any further access grants intact. Revoking all access requires checking those effects
  separately, including independently acquired workspace roles.

The confirmation makes appointing a non-member explicit. Existing members skip it
because they already receive the group's privileges, but managing membership additionally lets them
grant those privileges to others. The persistent explanation in the picker still applies to them.

**Personal limits have shared ownership.** If someone belongs to Support and Sales, either team's
group manager can edit the same personal limit, including a limit previously set by an admin. The
last successful edit applies. There is no additional financial ceiling for group managers beyond
existing validation. They can also edit their own limit if they belong to a group they manage.

**Revocation removes delegation, not its consequences.** Removing an assignment or removing a member
from a managed group removes the corresponding delegated authority. It does not undo prior membership
or limit changes, or access granted through them. Someone who added themselves to an admin-granting
group can retain workspace-wide authority after their group-manager assignment is revoked; removing
that authority requires a separate membership/access change. Existing self-lockout safeguards and
grants from other groups also affect removal. A member's usage view covers their existing cycle usage,
not just consumption since joining the team.

**Group changes may not change a member's effective limit.** A personal override or a higher allowance
from another group can still take precedence. Show the effective limit and its source after saving.

### Extension to other permissions

The same group-scoped grants can later support permission-management roles. Those roles must state
which capabilities a delegate may assign; having a capability does not imply authority to grant it.

For whole-group delegation, add or remove only that group's grant. The current Governance
`setGroups` operation replaces the workspace's entire recipient list and cannot be reused unchanged.
For individual selections, retain the originating team and remove team-derived access when membership
ends. Grants from other groups still apply: removing one team's grant is not a global denial.
