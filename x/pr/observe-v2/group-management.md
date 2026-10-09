# Group managers

Part of the [Observe & Understand Credits v2](https://app.notion.com/p/dust-tt/Observe-Understand-Credits-v2-3dc28599d94180f3b417ca4579ad3992) initiative.

Implementation: [work streams and PRs](group-management-plan.md). Validation: [QA plan](group-management-qa.md).

## Goal

Let workspace admins and managers appoint group managers so team leads can manage membership and credit allowances for
selected groups. They can do this without workspace-wide authority or asking an admin each time.
A team is an existing manual or provisioned group. Spending rules stay the same; provisioned
membership remains managed by the identity provider.

## What

### Assign group managers

Workspace admins and managers appoint and remove managers in the **Group managers** section of the existing
manual and provisioned group dialogs. A group can have several managers, and a person can manage
several groups. Managers must be active workspace members but need not belong to the groups they manage.

**People → Groups** shows each group's managers beside its name. Group dialogs show the number of
managers and members in their section headings.

This assignment lets group managers:

- View usage and limits for the group's current members.
- Edit those members' personal limits.
- Edit the group's existing per-member allowance.
- Handle usage-limit requests from the group's current members.
- Add existing workspace members to a managed manual group, or remove them from it, unless the group
  grants the workspace Admin role and the caller is not already a workspace admin.

Appointment does not change the person's workspace role or group membership. Membership changes
carry the group's access, roles, and seats, including when managers add themselves. The assignment
UI explains this and the Admin-group restriction. Workspace managers and admins keep their
workspace-wide access.

For example, Alice can manage Support while remaining an ordinary workspace member. She can add an
existing colleague to the manual Support group and adjust a Support member's allowance. She cannot
edit Sales or change limits for someone who belongs only to Sales.

### Confirm appointments outside the group

When appointing someone outside a manual group, confirm that the person appointing them trusts them to grant the
group's access. This applies only when the appointment allows membership editing. Follow the
[Figma design](https://www.figma.com/design/dhYmzTjBXjtmNOkjSfwumG/?node-id=108-39122):

> **Alex isn't a member of Finance**
>
> As manager, they can add anyone to the group, including themselves. Anyone they add gains the
> group's permissions and access to every space and data source shared with it. Continue only if you
> trust Alex with those permissions.
>
> **Cancel** · **Appoint anyway**

For several non-members, use “3 people you're appointing aren't members of Finance”, “As managers”,
and “Continue only if you trust them with those permissions” in one modal, with a blue action button.
Cancel saves nothing; **Appoint anyway** saves the pending changes.

Existing group members skip this modal. In the picker, managers outside the group have a blue
“Not group member” badge. Its tooltip explains that they can manage the group and grant themselves
its permissions and data. Pending membership additions keep the badge until saved; pending removals
show it immediately. The picker description reads “Group managers can add members and set their usage
and credit limits.” Follow the [picker design](https://www.figma.com/design/dhYmzTjBXjtmNOkjSfwumG/?node-id=104-33329).

Provisioned and admin-granting groups skip the warning because appointment does not grant membership
editing. Their picker and badge tooltip explain that membership is managed by the identity provider
or requires a workspace admin.

### Open the People page to group managers

Group managers get access to the existing **People** page, with a restricted view:

- **Members:** all active workspace members. Search, counts, and pagination cover the full member
  directory. A member's group list shows only managed groups.
  Actions add or remove membership in eligible managed groups; removing someone from a group does
  not remove them from the workspace.
- **Groups:** all managed groups and their members, including groups with read-only membership.
  Editable manual groups have add/remove controls. Provisioned groups explain that membership is
  managed by the identity provider; admin-granting groups explain that it requires a workspace admin.
- **Add members:** search existing active workspace members, including people outside the managed
  groups. Results show only the identity information needed to select someone, not their usage.

The group-manager role does not allow workspace invitations or removals, direct role or seat changes,
group creation, renaming or deletion, manager appointments, or changes to what a group grants.
These actions require their existing permissions.

Managers can edit membership in manual groups granting the workspace Manager role, billing/security
access, or paid seats. Any group granting Admin remains admin-only for membership changes, even if
it also grants other permissions. The Annex explains the effects of these membership changes.

### Reuse the Usage page

Group managers get access to the existing **Usage** navigation entry and URL. The page shows a
restricted view, with a short explanation such as “You manage usage for Support and Sales.”

| Part | Group manager experience |
| --- | --- |
| Members tab | Members of managed groups, with consumption, effective limit, its source, and an edit action. Members appearing in several groups appear only once. |
| Group filter | “All groups you manage” and each managed group. Clearing a filter never reveals the rest of the workspace. |
| Groups tab | Managed groups and their editable per-member allowances. |
| Requests list | Pending requests from managed members, with actions to edit the limit and approve, or deny. Request counts and filters use the same scope. |
| Personal-limit editor | Editable personal limit and managed groups' allowances. Other inherited settings are read-only explanations. |
| Other sections | Workspace settings, purchases, seat changes, and workspace-wide reporting are unavailable through this role. |

Only authorized administration entries appear in navigation. Other permissions a person already
holds continue to apply.

A manager can handle requests from anyone whose personal limit they can edit. Approval saves the
limit before marking the request approved. If the limit save fails, the request stays pending. If
the limit is saved but approval fails, keep the saved limit, explain this in the error message, and
refresh the request status. Denial changes only the request status.

Each request appears once, even when its requester belongs to several managed groups. Any authorized
manager can resolve it, but only the first resolution succeeds. Seat upgrades require their existing
permission. Request email notifications keep their current recipients.

### Keep the meaning of limits unchanged

This work preserves the existing behavior:

- A group allowance applies to each member; it is not a shared budget. A personal override takes
  precedence over group allowances. Without an override, the highest configured group allowance wins,
  then the workspace default if no group allowance applies.
- Personal edits remain ongoing and apply across the workspace. The editor states: **“This personal
  limit applies across the workspace.”** Raising a limit allows more consumption; it does not purchase
  or reserve credits.
- Managers of different groups can edit the same member's personal limit, including an override set
  by an admin. The last successful edit applies. Managers can edit their own limit if they belong to
  a group they manage. No extra spending ceiling is imposed on group managers.

A personal override or a higher allowance from another group can make a group allowance change have
no effect on a member's limit. Show the effective limit and its source after saving.

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
`write` for manual-group membership changes, keeping the existing admin-only membership guard for
admin-granting groups; filter it out for provisioned groups. Renaming and deleting groups continue to
require `admin` on the group, which this role does not grant. Update the verb contracts to make these
boundaries explicit.

No new permission table or budget fields are needed.

### 2. Manage assignments and discover access

Extend the existing GET/PATCH `/api/w/:wId/groups/:groupId` management API with `managerDiff`.
PATCH accepts one of `name`, `memberDiff`, or `managerDiff`. Each diff contains `add` and `remove`
user ID lists, leaving unmentioned users unchanged. Only workspace admins and managers may change
`managerDiff`. Validate active workspace membership and apply additions/removals through the grant
resource in a transaction.
Keep this path separate from manual membership updates so provisioned groups can also have managers.
Save `managerDiff` in its own PATCH; combining it with a name or membership change is rejected.
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
| Add/remove a group member | `write` on the target manual group and the existing membership guard: admin-granting groups require a workspace admin, regardless of delegation. |

Check workspace ownership, current delegation, and active membership on the server. A submitted group
or user ID is never evidence of authority. Use existing cache invalidation when assignments change;
clean up grants and their internal groups when the managed group is deleted.

For [member usage reads](../../../front/lib/api/credits/members_usage.ts), restrict the candidate members
to the authorized set before search, sorting, pagination, and counts. Intersect user-selected filters
with that set. Apply the same restriction to usage-editor lookups. The People members list and
add-member picker use the full workspace directory search, returning minimal identities without
usage or other administration data to group managers. Group lists use `managedOnly=true`; group
and member-group management reads enforce the managed-group scope.

For People visibility, reuse `read_usage`, which the group-manager role grants on manual,
provisioned, and admin-granting groups. Ordinary `read` is too broad because workspace members
already hold it on other groups. Use `canEditMembers` separately to enable membership controls;
read-only managed groups still appear.

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
cache invalidation. Allow membership edits for groups granting the Manager role, billing/security
permissions, or seats, including adding oneself.

Keep both existing protections unchanged: only workspace admins may edit an admin-granting group's
membership, and role sync blocks admin-role changes by non-admin actors. Retaining only the sync
block would be insufficient: membership is saved before synchronization, leaving membership and
roles inconsistent and allowing a later authorized sync to apply the role. Both membership-edit
paths must retain their current membership guard. Direct role assignment and changes to what a
group grants retain their existing checks.

Bulk usage endpoints remain workspace-manager/admin-only. Their workers also pass through the shared
mutation checks, using current authority when they execute.

### 4. Adapt the existing UI

Give the People and Usage routes their own access guards in
[adminRoutes](../../../front-spa/src/app/routes/adminRoutes.tsx), allowing workspace managers/admins and
group managers. Keep the other route guards unchanged.

At the existing Usage route, render a restricted view for group managers, reusing the shared member
section, group table, and limit inputs. Render a restricted People view in
[MembersPage](../../../front/components/pages/workspace/MembersPage.tsx). Keep workspace-only data
hooks and actions in the workspace views so group managers do not fetch hidden sections.
Use the auth-context scope and group permissions to populate filters, navigation, and edit controls.
Keep the admin-only read-only state for admin-granting groups, alongside the delegated membership
authorization for other manual groups. Hide workspace role changes, workspace removal, invitations,
group creation/deletion, and manager appointments unless the caller independently has their existing
permissions. When saving membership, omit the name unless it changed so the API does not require
rename authority for a membership-only edit.

Explain in the manager picker and membership editor that membership carries the group's access,
roles, and seats.

Before submitting manager additions, compare them with current active group membership and show the
confirmation described above. Treat someone removed in the same edit as a non-member too; adding them
in the unsaved form does not make them an existing member. Use the existing group and member data
for the confirmation. The modal is an explanation, not an authorization check:
assignment writes require a workspace admin or manager and the server validates every submitted field.

Pass explicit edit permissions to the personal-limit modal. Each group field needs its own check:
authority over a member does not grant authority over every group that member belongs to. Server
checks remain decisive if the page becomes stale.

Reuse the existing request list, denial action, and limit-editor approval flow. Do not expose seat
upgrades through the new role, and do not fetch workspace-wide requests before filtering them in the
browser.

## Annex

### Out of scope

- Shared team budgets, reserved credits, new spending ceilings, or new expiry behavior.
- Bulk usage actions, access through MCP tools, and changes to request email/notification routing.
- Delegating membership changes in admin-granting groups to non-admins, or relaxing admin-role sync protections.
- Purchasing credits, directly changing seats or workspace roles, inviting/removing workspace
  members, renaming/deleting groups, or appointing other group managers through the new role.
- Creator/publisher delegation, custom roles, and selecting groups as delegates in the assignment UI.
- A separate Teams product area or general access to conversation content and analytics.

### Tradeoffs and membership effects

Adding someone grants the group's access and allowance and lets its managers manage that person's
usage. Removing someone removes access from that group; grants from other groups still apply.
Usage covers the member's current cycle, including consumption before they joined the group.

Membership management therefore delegates who receives the group's privileges, without approval
for each change. A group that contains admins does not necessarily grant Admin: only groups that
grant that role have admin-only membership. Their managers can still manage usage.

Workspace admins and managers should account for these effects when appointing group managers:

- **Managers can grant themselves access.** They can add themselves to groups granting billing/security
  access or the workspace Manager role. Appoint only people trusted with those privileges.
- **Membership and sensitive access may need different owners.** Keep team groups separate from
  groups granting sensitive permissions when the same person should not control both.
- **Authority can grow later.** Review managers when adding privileges to a group. The appointment
  warning does not cover later changes. A group newly mapped to Admin becomes admin-only for membership.
- **Membership changes can affect costs and access.** Adding members can allocate paid seats;
  removing them can withdraw billing/security access or demote workspace managers. Keep a way for
  admins to recover access.

Existing members skip the appointment warning because they already have the group's privileges.
Managing the group also lets them grant those privileges to others; the picker explains this.

Removing an assignment, or a member leaving a managed group, ends the corresponding delegated
authority. It does not undo earlier membership or limit changes. A manager who added themselves
to a group granting Manager or billing/security access can retain that access after their assignment
is removed. Revoke that membership or access separately, subject to existing self-lockout protections
and grants from other groups.

### Extension to other permissions

The same group-scoped grants can later support permission-management roles. Those roles must state
which capabilities a delegate may assign; having a capability does not imply authority to grant it.

For whole-group delegation, add or remove only that group's grant. The current Governance
`setGroups` operation replaces the workspace's entire recipient list and cannot be reused unchanged.
For individual selections, retain the originating team and remove team-derived access when membership
ends. Grants from other groups still apply: removing one team's grant is not a global denial.
