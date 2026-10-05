# Group management implementation plan

This plan implements the [group manager design](group-management.md): scoped People and Usage pages,
manual-group membership editing, limit editing, and usage-request handling.

Manual validation: [QA plan](group-management-qa.md).

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

Shipped follow-ups show [manager and member counts](https://github.com/dust-tt/dust/pull/33338) in
the dialogs and [managers beside each group](https://github.com/dust-tt/dust/pull/33339) in People → Groups.

#### PR 7 — Confirm manager appointments outside the group

Before saving new managers for a manual group whose membership can be delegated, show a confirmation
for those who are not already active group members. Explain that they can add anyone to the group,
that everyone they add gains its permissions and access to shared spaces and data sources, and that
the appointment requires trusting them with those permissions. Use the singular/plural copy and blue
“Appoint anyway” button from the [design](group-management.md#confirm-appointments-outside-the-group).
This depends on PRs 4–6. The initial confirmation shipped in [#33267](https://github.com/dust-tt/dust/pull/33267);
the design follow-up simplifies its copy and removes the Governance request.

- Reuse current group and member data; no permissions summary needs loading.
- Existing members, provisioned groups, and admin-granting groups skip this modal. For several non-members, confirm them together; cancellation sends no update.
- Treat members removed in the same edit as non-members; an unsaved addition does not count as existing membership.

#### PR 7 follow-up — Identify managers outside the group

Add the blue “Not group member” badge and tooltip to selected managers in the picker, using the
[updated design](group-management.md#confirm-appointments-outside-the-group). Keep the badge for
unsaved member additions and show it for pending removals. Shorten the manual-group helper text;
retain the directory-managed and Admin-only membership explanations for restricted groups.

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

#### PR 11a — [Observe v2] Extract shared Usage members section

Move the member search, group filter, table layout, and optional Requests switch into a shared
section. Keep the workspace Usage behavior unchanged. PR 12 builds on this.

#### PR 12 — Open the restricted Usage page

Allow group managers into the existing Usage route and navigation entry. Render the Members and
Groups views with an “All groups you manage” filter, using the shared member section and existing
tables and limit editor. This delivers a complete usage-management path and depends on PRs 5, 8–11,
and 11a.

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

## Stream 3: Let group managers manage people

### PR 16 — Provide People data for managed groups

Add a scoped mode to member search that returns active members of the caller's managed groups,
with correct pagination and counts. Apply the same scope to group and member-group management reads,
including provisioned and admin-granting groups. Preserve the workspace-wide identity search used to
select people to add. This builds on the scope helpers from PR 2.

- Use `managedOnly=true`; the server derives the scope rather than trusting browser-supplied group IDs.
- Reuse `read_usage` to identify managed groups; ordinary `read` also covers groups the caller does not manage.
- Deduplicate overlapping members and apply scope before search, counts, and pagination.

### PR 17 — Allow membership changes in managed groups

Open the existing membership APIs to group managers behind `group_management`. Reuse their permission
checks, membership validation, role/seat synchronization, and audit events. Keep provisioned
membership directory-owned and admin-granting membership admin-only. This follows PR 16.

- Authorize the target group even when the person being added is not yet a member.
- Preserve the admin-role sync block, last-member protection, and server permission-cache invalidation.
- Cover allowed edits, out-of-scope rejection, and disabled-flag behavior with focused tests.

### PR 18 — Adapt People controls to group managers

Make existing dialogs and member actions respect the caller's allowed actions. Restrict membership
controls to eligible managed groups and hide workspace-level actions the caller cannot perform.
Include the fix to omit an unchanged group name when saving membership. This follows PR 17.

- Visibility uses the managed-group scope; membership editing uses `canEditMembers`.
- Keep role changes, workspace removal, invitations, group creation/deletion, and manager appointments
  under their existing permissions.

### PR 19 — Open People to group managers

Open the existing People route and navigation entry behind `group_management`. Connect its Members
and Groups tabs to the scoped reads and permission-aware controls. Avoid loading workspace-only
settings for the restricted view. This follows PR 18 and completes the required People work.

### PR 20 — Refresh People after membership changes (optional)

Refresh the scoped member list and displayed permissions after successful membership changes. This
keeps the page current without requiring a reload; it adds no new authorization rules. Existing
mutation hooks already update group membership and counts. Add this follow-up only if the remaining
refresh work stays small; it is not a rollout requirement.

Server authorization and permission-cache invalidation remain required in PR 17. A stale page must
never permit an operation that the caller is no longer authorized to perform. Each required PR
includes focused validation; no separate testing or infrastructure PR is needed.

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
