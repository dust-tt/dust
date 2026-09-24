# Group management implementation plan

This plan implements the [group manager design](group-management.md): scoped People and Usage pages,
manual-group membership editing, limit editing, and usage-request handling.

| Stream | Outcome | Can start after |
| --- | --- | --- |
| 1. Permissions and assignments | Store group managers, resolve their authority, and let admins appoint them. | Now |
| 2. Usage and requests | Let group managers see usage, edit limits, and handle requests. | PR 2; the UI also needs PR 5. |
| 3. People and membership | Let group managers see their groups and add/remove members. | PR 2. |

## Stream 1: Permissions and assignments

### 1A. Represent and enforce authority

#### PR 1 — Define the group manager role

Add the group-scoped role and its verbs to the existing permission system. Teach groups to combine
these grants with existing workspace-role permissions. Declare the workspace feature flag for later
API and UI checks, defaulting to off; keep permission definitions and generic permission checks free
of flag conditions. This establishes the role without opening new user-facing entry points.

- Reuse `read` and `write`; add `read_usage` and `set_usage_limits` without changing existing verb bits.
- Provisioned groups never gain editable membership; the role does not grant rename/delete authority.
- Keep admin-granting groups' membership admin-only, even for explicitly assigned group managers.

#### PR 2 — Resolve scope for a requested verb

Provide the shared way to determine which groups and active members a caller may act on for a given
verb. Later reads and writes use the same rules, so a table filter and an edit cannot disagree about
who is authorized. This depends on PR 1.

- Handle workspace managers/admins, all-group grants, empty scopes, and overlapping memberships.
- Check the target member's workspace and current group membership; the caller need not be in that group.

#### PR 3 — Clean up assignments when groups disappear

Delete grants targeting a removed group and the internal groups used to hold its manager assignments.
Invalidate the relevant permission caches so deleted groups cannot leave usable delegation behind.
Cover both manual deletion and provisioned-group removal. This depends on PR 1.

### 1B. Let admins assign managers

#### PR 4 — Add manager assignments to the group API

Extend the existing group GET/PATCH API with the manager list. Admins can replace that list without
changing membership, including for provisioned groups. Validate every supplied field before changing
anything, apply grant additions/removals together, and audit assignment changes. Gate assignment
changes on the workspace feature flag at the API entry point. This depends on PRs 1 and 3.

- An omitted `managerIds` leaves assignments unchanged; an empty list removes them all.
- A caller allowed to edit members still cannot change managers or other restricted fields.

#### PR 5 — Expose group authority to the browser

The server's `Authenticator` already resolves grants, but the browser's `useAuth()` receives only role
booleans and workspace-level permissions. Add the derived group scope to the existing auth response
and allowed actions to group responses, using those server checks. Navigation and both pages can then
use them without a new endpoint or a second permission engine. This depends on PRs 1–2.

#### PR 6 — Add the admin manager picker

Add the Group managers field to the existing manual and provisioned group dialogs. Show current
assignments and let workspace admins update them through the API. State that delegated membership
management includes granting the group's access, Manager role, and seats, including to oneself.
Explain that admin-granting groups keep membership admin-only while usage remains delegated. This
depends on PRs 4–5 and stays behind the feature flag; it does not open group management to delegates
by itself.

#### PR 7 — Confirm manager appointments outside the group

Before saving new managers for a manual group whose membership can be delegated, show a confirmation
for those who are not already active group members. List the configured Manager role, governance
permissions, and seats, and explain that they can add themselves or others. Use the copy in the
design. This depends on PRs 4–6.

- Reuse current group membership, role/seat fields, and Governance data/labels; show no permissions the group does not actually grant.
- Existing members, provisioned groups, and admin-granting groups skip this modal. For several non-members, confirm them together; cancellation sends no update.
- Treat members removed in the same edit as non-members; an unsaved addition does not count as existing membership. Wait for the summary to load before allowing confirmation.

## Stream 2: Usage and requests

### 2A. Read usage and edit limits

#### PR 8 — Scope usage reads to managed members

Let group managers fetch usage for authorized members through the existing usage APIs. Apply that
scope before search, sorting, pagination, and counts, including lookups used by the limit editor.
Clearing a filter cannot broaden access. This depends on PR 2.

- Overlapping managed groups produce one row per member.
- Test an empty scope and a request for an out-of-scope member, not just the normal filtered view.

#### PR 9 — Authorize personal-limit edits

Allow a group manager to set or clear a current member's personal limit using `set_usage_limits`.
Enforce the check in the shared mutation service as well as the HTTP path, and include the authorizing
group and previous/new settings in the audit event. Existing limit behavior stays the same.
This depends on PR 2.

- Bulk endpoints and workers remain workspace-manager/admin-only: workers recheck that role even if the actor still holds group delegation.
- A member leaving the managed group between loading and saving must make the save fail.

#### PR 10 — Authorize group-allowance edits

Allow `set_usage_limits` on a group to authorize changing that group's per-member allowance. Keep
existing value validation and credit-state reconciliation, and record the change in the audit log.
Authority over one member does not allow editing all their groups. This depends on PR 2.

#### PR 11 — Make usage tables and editors respect allowed actions

Adapt the existing tables and limit editor to accept the authorized groups and editable fields.
Keep inherited settings explanatory and read-only where appropriate, and retain the note that a
personal limit applies across the workspace. Existing workspace-wide views keep their current
behavior. This depends on PR 5.

#### PR 12 — Open the restricted Usage page

Allow group managers into the existing Usage route and navigation entry. Render the Members and
Groups views with an “All groups you manage” filter, using the existing tables and controls.
This delivers a complete usage-management path and depends on PRs 5 and 8–11.

- Mount workspace-only data hooks in the workspace view, so hidden sections are not fetched.
- Keep purchases, workspace settings, seat changes, and bulk usage actions under their existing permissions.

### 2B. Handle usage-limit requests

#### PR 13 — List requests within the manager's scope

Allow group managers to see pending requests from members for whom they hold `set_usage_limits`.
Filter in the resource/query path, including counts and any group filter. A request appears once even
if several managed groups contain its requester. This depends on PR 2.

#### PR 14 — Authorize request resolution

Allow the same verb to approve or deny a request, checking current authority over its requester in
both the service and resource paths. Keep the existing resolution audit event and record which group
authorized the action. This depends on PR 2; it can merge separately from request-list access.

- Resolve only pending requests, using a conditional update so concurrent managers cannot both resolve one.
- Saving a limit and recording approval remain separate operations, each with its own authorization.

#### PR 15 — Add requests to the restricted Usage view

Show the existing request list to group managers, with denial and approval through the limit editor.
Save the limit before marking the request approved. If recording approval fails, explain that the
limit was saved and refresh the request status. This depends on PRs 9 and 12–14.

- Hide the seat-upgrade action unless the caller independently has its existing permission.
- Request creation and email recipients remain unchanged; this PR adds in-page handling only.

## Stream 3: People and membership

### 3A. Read and edit managed groups

#### PR 16 — Scope People data and support adding members

Provide the managed-group and member data needed by People, with scoped lists and counts. The add
picker can search active members across the workspace, because the person being added is not yet in
the group. That search returns only the identity information needed to select them. This depends on
PR 2.

- Apply restrictions to People management reads without narrowing the general group directory used elsewhere.
- Finding someone in the add picker grants no access to their usage or other administration data.

#### PR 17 — Open authorized membership mutations

Allow group managers to add and remove members through the existing group-edit and member-group APIs,
including for manual groups granting the Manager role, billing/security access, or seats. Check the
target group's membership authorization in the shared mutation path. This depends on PR 2.

- Preserve active workspace membership, last-member protection, existing role/seat synchronization, and audit events.
- Retain both the admin-only membership guard and the role-sync block on admin-role changes by non-admins. Test rejection before any membership is changed, even with explicit delegation.
- Cover self-addition and the resulting roles, permission access, and seat changes; reject edits outside the delegated scope.
- Provisioned groups remain directory-owned; membership authority does not permit renaming or deleting a group.

### 3B. Open the People experience

#### PR 18 — Make group membership controls permission-aware

Adapt the existing group dialogs and member actions to expose only allowed membership edits. Use the
workspace member picker for additions. Keep admin-granting groups read-only for non-admins and explain
that membership requires a workspace admin; provisioned membership remains directory-managed.
Explain the access, Manager role, and seats carried by editable groups. Keep manager assignments
admin-only. This depends on PRs 5–6 and 16–17.

#### PR 19 — Open the restricted People page

Allow group managers into the People route and navigation entry, showing managed groups and their
members. Reuse the existing lists and the controls from PR 18; refresh affected lists and scope after
membership changes. This completes the membership-management path and depends on PRs 5 and 16–18.

- Keep workspace invitations/removals, direct role/seat changes, changes to group grants, and group creation/deletion under existing permissions.
- Test revocation on an already-open page: reject edits when delegation was the only authority, refresh access, and retain access independently granted by workspace roles or other groups.

## Merge order and rollout

Land PRs 1–2 first. The remaining foundation work, Usage backend work, and People read work can then
proceed alongside each other, following the dependencies above. The assignment UI, Usage page, and
People page become available through separate mergeable PRs; they do not need one large final merge.

Keep the feature flag off for customers until assignments, appointment confirmation, revocation,
both pages, and request handling are complete. Before enabling it for a workspace, exercise one
manager with two groups, one overlapping member, a member removal, and a request resolved by another
manager. Most regression coverage should already have landed with the corresponding PRs.

Gate delegated access at the API and UI entry points. With the flag off, APIs keep the existing
workspace-role requirements even if delegation grants already exist. Keep existing tool and worker
role checks; do not add flag conditions throughout the registry, `Authenticator`, or resource methods.

Feature-flag enablement is an operational step, not a reason to create an otherwise empty PR. Any
implementation fixes found during validation should remain small PRs in the relevant stream.
