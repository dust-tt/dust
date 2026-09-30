# Group management manual QA

Use this checklist to validate the [group manager behavior](group-management.md) delivered by the [implementation plan](group-management-plan.md). Record failures with the account, group, action, and observed result. Check a box only after running it.

## Setup

Use a test workspace with `group_management` enabled and usage limits available. Keep separate
sessions for a workspace admin, a workspace manager, and **Alex**, an ordinary member who will
manage groups. Create these groups with active members:

| Group | Membership | Alex manages it? |
| --- | --- | --- |
| Support | Manual: Lee and Pat | Yes |
| Sales | Manual: Sam, Pat, and Alex | Yes |
| Legal | Manual: Mira and Pat | No |
| Directory | Provisioned: at least one member | Yes |
| Admins | Manual, grants Admin: at least one member | Yes |

- Appoint **Casey**, another ordinary member, manager of Support for checks involving two managers.
  Keep **Jo**, an active member with some current-cycle usage, outside these groups for addition tests.
- Give the workspace, Support, Legal, and Sales distinct allowances, with Sales highest. Give Pat
  a personal limit different from these. Prepare pending requests from Lee, Pat, and Mira.
- Share a test space with Support to check access changes. Use enough sample members to exercise
  a second page when checking pagination.
- Reserve a manual group **Privileged** granting Manager and, where supported, billing/security
  access or a paid seat. Keep Alex outside it until the final checks.

## Appointments and group settings

- [ ] As admin, open each group dialog. Current managers are shown beside groups in the group list, and manager/member counts in the dialogs match the saved people.
- [ ] In Support, select an existing member as manager. The non-member warning does not appear. Save; the assignment is visible after reopening, without changing that person's role or membership.
- [ ] In Support, select an active non-member as manager. The picker marks them **Not group member** and explains the access they can grant. Cancel the warning: nothing is saved. Repeat and choose **Appoint anyway**: the manager is saved, but is still outside the group.
- [ ] Select several non-members together. One warning uses plural copy and one confirmation saves all pending appointments. A member added only in the unsaved membership form still triggers the warning; a member pending removal is treated as a non-member.
- [ ] In Directory and Admins, appoint a non-member manager. There is no membership warning; the picker explains directory-owned or admin-only membership instead. Both assignments save.
- [ ] As Alex, try to edit manager assignments, rename or delete a group, or change what a group grants. These actions are unavailable; a direct request also fails. The admin can still update and clear manager assignments.

## Scoped People page

- [ ] As Alex, open **People** from navigation and by URL. **Members** shows active members of managed groups only; Pat appears once. Search, pagination, and counts stay within that set. Legal-only members and workspace-wide settings do not appear.
- [ ] **Groups** shows Support, Sales, Directory, and Admins, with their members. Legal is absent. Support and Sales offer membership controls; Directory says membership is managed in the identity provider; Admins says it requires a workspace admin.
- [ ] Open Pat's member dialog. Its group list shows Support and Sales, not Legal. Add/remove controls apply only to editable managed groups.
- [ ] Open **Add members** for Support. Search finds Jo and other active workspace members outside Alex's managed groups, showing only the identity needed to select them. It does not show their usage or workspace administration data.
- [ ] As Alex, check that invitations, direct role or seat changes, workspace removal, group creation/deletion, and manager appointments are unavailable. Opening their existing URLs or submitting their requests directly does not grant access.

## Membership changes

- [ ] As Alex, add Jo to Support. After reloading, Jo appears in People and Usage, including usage from before joining. Jo gains access to the test space. Remove Jo: group access ends, but Jo remains a workspace member. A manual reload is acceptable when the People list is stale.
- [ ] Remove Pat from Support. Pat's Sales and Legal memberships remain, and Alex can still manage Pat through Sales. Remove Lee from Support: Alex can no longer see or edit Lee unless another managed group contains Lee.
- [ ] Try adding or removing members in Legal, Directory, and Admins, including through direct requests. All fail for Alex; the saved membership and roles remain unchanged. The admin can still edit Admins, and directory provisioning remains the owner of Directory membership.
- [ ] Check that existing last-member and self-lockout protections still apply to delegated membership edits.
- [ ] Restore Pat and Lee to Support, and confirm Alex remains an ordinary member, before starting Usage and request checks. A manual reload is enough to update the People view.
- [ ] If the optional PR 20 is included, add/remove Jo through both the group dialog and a member's group controls. Successful edits refresh the current session's People list and permissions without a reload. Changes made in another session may still require a reload.

## Scoped Usage and limits

- [ ] As Alex, open **Usage** from navigation and by URL. The page explains the managed scope. **Members** shows Lee, Sam, Pat, and other current managed members once each, with consumption, effective limit, source, and edit action. Legal-only members are absent.
- [ ] Switch between **All groups you manage**, Support, Sales, Directory, and Admins. Results, request counts, search, and pagination match the selected scope. Clearing a filter never reveals the whole workspace. **Groups** shows only managed groups and their editable per-member allowances.
- [ ] Open Pat's personal-limit editor. It says the personal limit applies across the workspace. Set a valid limit lower than Sales' allowance; the personal override still wins. Clear it: Sales' allowance wins over Legal, Support, and the workspace default. Check the displayed source at each step.
- [ ] Alex and Casey edit Pat's personal limit in sequence. The last successful edit applies across the workspace. Alex can also edit Alex's own personal limit through Sales. Existing seat allowance behavior is unchanged.
- [ ] Edit Support's allowance and clear it. A personal override or higher Sales allowance may keep a member's effective value unchanged; Legal's allowance is unaffected. For Lee, with no other group allowance or personal override, the workspace default becomes effective after Support's allowance is cleared.
- [ ] When editing a member who also belongs to Legal, Alex can edit the personal limit and allowances of managed groups only. Other inherited settings are explanatory and read-only. A direct attempt to change Legal's allowance fails.
- [ ] As Alex, try to read or edit usage for a Legal-only member by URL or direct request. It fails. Purchases, workspace settings, bulk actions, seat upgrades, and workspace-wide reporting retain their existing permissions.

## Usage-limit requests

- [ ] As Alex, the request list and count include Lee and Pat only while they belong to managed groups; Pat's request appears once. Mira's Legal-only request is absent, including under search and filters.
- [ ] Create a fresh pending request, or reset the request fixture, before each resolution or failure check below. Use a Support requester for checks involving Casey.
- [ ] Open a pending request's approval editor and cancel it. The request stays pending and no limit is saved. Simulate a failed limit save: the request stays pending and the attempted limit does not apply.
- [ ] Deny Lee's pending request. Its status changes once; Lee's limit does not change. Repeating the resolution fails or reports that it is already handled.
- [ ] Approve Pat's pending request through the limit editor. The chosen limit saves before the request becomes approved; the effective limit and request status reflect both changes.
- [ ] With Casey, open the same pending Support request in two sessions. Resolve it in one session, then try in the other. Only one resolution succeeds; the second sees the current status after refresh.
- [ ] Simulate failure of the approval update after a successful limit save. The limit remains saved; the UI says the limit was saved but approval failed, and automatically refreshes the request status. Resolve it afterward if still pending.
- [ ] Remove a requester's last managed-group membership, then try to approve or deny their previously loaded request as Alex. The stale action fails with an error; reloading removes the request from Alex's view.

## Revocation, flag, and existing roles

- [ ] Have the admin revoke Alex's Support assignment. After a reload, Support-only people, group settings, and requests leave Alex's scope. A stale edit or direct request fails with an error. Prior membership and limit changes remain saved.
- [ ] Remove Alex's remaining assignments. People and Usage access gained only through group management disappears; stored changes to members, limits, and grants are not rolled back.
- [ ] Disable `group_management` while the assignments are still stored, or restore an assignment before disabling it. Alex loses delegated page and API access. Re-enable it and verify current assignments work again.
- [ ] As the workspace manager and admin, repeat a normal People membership change, Usage read/limit edit, and request resolution. Their existing workspace-wide access still works, including outside the managed groups; only the admin can edit Admins membership and manager assignments.

## Sensitive membership, last

- [ ] With the flag enabled again, have the admin appoint Alex manager of Privileged. As Alex, add an ordinary test member, then add Alex. The group's configured Manager role, billing/security access, or seat follows membership. Direct role and seat controls still use their existing permissions.
- [ ] Revoke Alex's Privileged manager assignment. Alex keeps privileges gained by joining the group. Have the admin remove Alex from Privileged; those group-derived privileges then end, subject to any independent grants. Do not use Alex for scoped-access checks after self-addition.
