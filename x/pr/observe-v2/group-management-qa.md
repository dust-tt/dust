# Group management QA — Dust (EU)

Test in **Dust (EU), `xt80HLpd1C`**, using the existing groups and members below.
This checklist covers the [product behavior](group-management.md) and [implementation plan](group-management-plan.md).
The inventory was checked through read-only EU production database queries on **1 October 2026**;
the tests themselves have not been run. Assume `group_management` stays on.

## What this workspace can cover

The workspace has credit pricing, active Metronome billing, SCIM, and usage requests enabled.
It has 140 active members, 12 manual groups, and 8 provisioned groups. Core People, Usage,
appointments, membership, and billing/security delegation tests can run here after the setup below.

**[PREP]** means existing accounts or settings need arranging first. **[GAP]** means the current
workspace does not cover the case as configured, or the required live data has not been verified.
Keep these checks open until their stated prerequisite is met.

| Coverage | Current state and remaining work |
| --- | --- |
| Core scoped views and membership | Existing manual groups overlap, and provisioned groups cover read-only membership and member pagination. Appoint RadjaTest first. |
| Limit editing and precedence | **[PREP]** All manual group allowances are unset. Set two temporary values; use RadjaTest for predictable effective limits. |
| Usage requests | **[PREP]** Requests are enabled, but none are pending. Create fresh requests with tester-controlled accounts before testing resolution. |
| Access to a restricted space | **[PREP]** `Test space` exists, but neither core group grants access to it. Temporarily share it with `hello` and verify RadjaTest has no independent access. |
| Usage from before joining a group | **[GAP: verify in UI]** Current-cycle consumption comes from Elasticsearch/Metronome, so this database inspection did not confirm a suitable account's usage. Send a message first if needed. |
| Admin-group protection and Manager-role self-addition | **[GAP: configure a group]** No existing group grants Admin or Manager. These cases need an existing manual group prepared for role changes, or another workspace. Having admins among the members does not make a group Admin-granting. |
| Seats granted through membership | **[GAP: contract and group setup]** No group grants seats. Active members have 123 `workspace_yearly` seats and 17 `none` seats; there are no Pro, Max, or free-seat examples. Confirm an allowed seat mapping and a suitable test account before running this case. |
| Simultaneous approval and partial failures | **[PREP]** Use two ordinary group managers and fresh requests. Failure cases need browser request blocking or another controlled failure. |

## Existing fixtures and setup

Keep two sessions: **your own account** for admin setup and workspace-manager regressions, and
**RadjaTest** for delegated actions. RadjaTest means the separate login supplied to each tester;
it is not a confirmed display name from the inventory. Start it as an active ordinary workspace
member with a pool-bearing seat and no other management permissions. A workspace Manager role
would hide scope failures by granting workspace-wide access.

Use these groups by their exact names:

| Group | Existing active members / grants | Use |
| --- | --- | --- |
| `hello` | Fabien Celier, Yuka Masuda; no role, seat, or direct permission grants | First managed manual group |
| `test-fabien` | Achille Burah, Arthur Galy, Fabien Celier, Matteo Trabattoni; no role, seat, or direct permission grants | Second managed manual group; Fabien is the overlap |
| `matteo-test` | Matteo Trabattoni | Unmanaged group belonging to a visible member |
| `test-pr` | Elias Nefzi, Mzero_test (pr); grants billing access | Unmanaged group; its members are outside the core scope |
| `Dev` | 30 active members; provisioned | Read-only membership phase |
| `team-france` | 84 active members; provisioned | Member pagination phase |
| `test-m0-pr` | Mzero_test (pr); grants billing and security access | Final privileged-membership phase only |

Useful identities: **Mzero_test (pr)** (`rXNgwOQeF1`) is outside both core groups;
**Philippe R.** (`oO6YaZpIRd`, distinct from Philippe Rolet) is an ordinary member with no manual
or provisioned group membership. Use existing colleagues for read checks and accounts controlled
by the testers for changes that require signing in as the affected person.

1. Record the current managers, memberships, and allowances of groups you will change. Coordinate
   shared groups between testers and restore your changes afterward.
2. As admin, appoint RadjaTest manager of `hello` and `test-fabien`, initially without adding her
   as a member. Her initial visible Usage members should be the five unique people listed above.
   Remove any extra test assignments that would broaden that scope.
3. Leave `Dev` and `team-france` unmanaged for the core tests. Appoint RadjaTest to them only during
   the provisioned-group phase, then revoke those assignments. Otherwise removing someone from a
   manual group may leave them visible in Usage through a provisioned group.
4. For a second delegated manager, use another tester's RadjaTest and appoint it to the same groups.
   Alternatively, temporarily make your own account an ordinary member; restore its role for admin operations.

## Appointments and scoped pages

- [ ] As admin, verify group managers beside group names and the manager/member counts in group dialogs. Appoint Fabien to `hello`: no non-member warning. Restore the original assignment afterward.
- [ ] Appoint RadjaTest while she is outside `hello`. The blue **Not group member** badge and warning explain the access she can grant. Cancel: nothing saves. **Appoint anyway** saves the assignment without changing membership or workspace role.
- [ ] Repeat with two outside accounts for the plural warning. An unsaved membership addition still counts as outside; a pending removal also triggers the warning. Restore the starting memberships.
- [ ] As RadjaTest, open People and Usage from navigation and by URL. People lists all workspace members and only the two managed groups. Usage lists only the managed groups and their five unique members; Fabien appears once. Usage search, filters, and counts remain scoped when filters are cleared.
- [ ] Open Matteo's People member dialog. `test-fabien` appears; unmanaged `matteo-test` does not. His Usage limit editor can explain inherited allowances from unmanaged groups but cannot edit them.
- [ ] Search for Mzero_test or Philippe R.: both appear in the People member list, but neither appears in Usage. The add-member picker can find them by identity, without exposing usage. Direct usage reads or edits for them fail.
- [ ] Invitations, workspace removal, direct role/seat changes, group creation/rename/deletion, changes to group grants, and manager appointments are unavailable to RadjaTest. Direct requests fail too.

## Membership and provisioned groups

- [ ] Add RadjaTest herself to `hello`. She appears in the Usage member list and can manage her own limit. Remove her from the group: her manager appointment remains, but usage authority over herself ends. Repeat an add/remove through a member's group controls using a tester-controlled member; removing group membership never removes workspace membership.
- [ ] Remove Fabien from `hello`: he remains visible in Usage through `test-fabien`. Restore Fabien, then remove Yuka: she leaves RadjaTest's Usage scope but remains in the People member directory. A previously open usage edit fails. Restore Yuka before continuing.
- [ ] Temporarily appoint RadjaTest manager of `matteo-test`. Try removing its sole member, Matteo, through the member's group controls: it must fail and leave membership unchanged. Revoke this temporary assignment.
- [ ] **[PREP: space]** Share existing `Test space` with `hello`. Verify RadjaTest cannot access it before joining, can after joining, and loses access after leaving. Remove the temporary sharing afterward. `Company Data` is not a substitute: everyone already has reader access, so leaving `test-scbe` cannot remove all access to it.
- [ ] **[GAP: usage fixture]** Before adding a tester-controlled account to `hello`, confirm nonzero usage in the current cycle. After adding it, RadjaTest sees that earlier consumption too. If no suitable account has usage, generate some and leave this case open until it appears.
- [ ] Temporarily appoint RadjaTest to `Dev` and `team-france`. Non-member appointments skip the membership warning. Both groups appear and explain directory-managed membership; add/remove attempts fail. Their member usage and limits remain manageable. Check deduplication and a second page of members, then revoke these assignments.
- [ ] Successful membership edits through both group and member dialogs refresh the current session's People data when PR 20 is included. A manual reload is acceptable without that optional follow-up; changes made in another session may require one.

## Limits

**[PREP]** Temporarily set `hello` to 200 credits per member and `test-fabien` to 400, then add
RadjaTest to both. She must have no other group allowance or personal override for the baseline.
The workspace default is currently **100,000**. Values below are pool allowances; any seat allowance
is added when showing the effective total.

Existing employees are less predictable fixtures: Fabien, Yuka, and Matteo also belong to `Team`,
whose allowance is **1,000,000**; `Dev` grants **2,000**. Achille already has a personal override.
Do not expect the temporary 200/400 settings to replace those higher or overriding limits.

- [ ] As RadjaTest, set her personal pool limit to 100. The personal override wins even though it is lower than both group allowances. The editor says it applies across the workspace. Clear it: `test-fabien`'s 400 wins, even though the workspace default is higher.
- [ ] Clear `test-fabien`'s allowance: `hello`'s 200 wins. Clear `hello`'s allowance: the workspace default applies. Verify the effective value and source each time. Restore both group settings and RadjaTest's starting personal limit.
- [ ] With both testers acting as ordinary group managers, edit the same tester-controlled member's personal limit in sequence. The last successful edit applies, including over an override previously set by an admin.
- [ ] On Fabien or Matteo, unmanaged inherited settings stay read-only; a direct attempt to edit `Team` or `matteo-test` fails. Changing a managed allowance need not change the effective limit while a higher inherited allowance applies.
- [ ] Bulk actions, purchases, workspace defaults, and seat upgrades retain their existing permissions. Do not use a `none`-seat account for limit precedence: it has no pool access.

## Usage-limit requests

**[PREP]** There are currently **zero pending requests**. Use a tester-controlled ordinary account
with a seat: bring it near its limit through the UI, then submit a request. Workspace admins/managers
do not get the ordinary member's request prompt. Request emails are enabled and keep their normal
recipients. Create a fresh request for each case; changing membership moves an existing request
between scopes without needing another account.

- [ ] Start with the requester outside `hello` and `test-fabien`: RadjaTest cannot see the request. Add them to both: it appears once, with correct group filtering and counts.
- [ ] Cancel the approval editor or fail the limit save. The request stays pending and the attempted limit does not apply. Deny a fresh request: only its status changes.
- [ ] Approve a fresh request: the limit saves before approval. Use two ordinary group managers on another request; after one resolves it, the other's attempt fails and shows the refreshed status.
- [ ] Fail the approval update after a successful limit save. The limit stays saved; the error explains that, and the request status refreshes automatically. This needs controlled request failure, not different workspace data.
- [ ] Remove the requester from both managed groups while their request is open. RadjaTest's stale approve/deny attempt fails. Restore the memberships and test limit afterward.

## Revocation and existing roles

- [ ] Keep a `hello` member edit open as RadjaTest, then revoke her `hello` appointment from the admin session. A stale edit fails; after reload, `hello` disappears from People and Usage, and members visible only through it disappear from Usage. All workspace members remain visible in People. Earlier membership and limit changes remain saved.
- [ ] Revoke all RadjaTest's assignments. Access gained only through group management disappears after reload. Restore her starting assignments afterward.
- [ ] On your own account, repeat a membership change, limit edit, and request resolution as workspace Manager, then Admin. Existing workspace-wide access still works. Return RadjaTest to ordinary-member status before any further scoped checks.

## Privileges and remaining gaps — run last

- [ ] Temporarily appoint RadjaTest manager of `test-m0-pr` while she is outside it. Add her as a member: she gains its billing/security access. Revoke only her manager appointment: that membership-derived access remains. Remove her membership as admin to restore the baseline. This existing group covers sensitive access without creating a group.
- [ ] **[GAP: Admin-granting group]** Needs a manual group configured to grant Admin, with a controlled member already in it. Appoint RadjaTest from outside: no membership warning; membership stays read-only, and direct add/remove attempts fail without changing roles or membership. Usage management must still work. Restore the mapping afterward.
- [ ] **[GAP: Manager-granting group]** Needs a manual group configured to grant Manager. A delegated RadjaTest can add herself and gains the workspace Manager role. Revoking her appointment does not undo that role; remove the membership separately, then restore the group. Check existing self-lockout protection with a separate admin session available.
- [ ] **[GAP: seats]** Verify the contract offers a seat that an existing manual group can grant, and use an eligible tester-controlled account that does not already have it. Check allocation on membership and the result of removal. Existing `workspace_yearly` memberships alone do not prove the seat mapping is available; personal-seat allowance behavior needs a suitable Pro/Max fixture too.

For these missing group mappings, agree which existing group to reconfigure and keep an original
member in it for cleanup. Starting with an empty group is awkward: the normal membership controls
will not let you remove its last member afterward.

Restore the recorded memberships, grants, appointments, and limits. Record any unrun **[PREP]** or
**[GAP]** checks as remaining QA; configuration inspection is not a test pass.
