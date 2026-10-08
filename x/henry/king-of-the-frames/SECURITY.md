# Security and privacy

The repository contains tooling and synthetic examples only. Real datasets, attachments, mappings,
responses, output URLs, conversation IDs, workspace IDs, usage exports, and reviewer identities stay
in an ignored working directory.

## Never commit

- API keys, OAuth access or refresh tokens, Slack tokens, cookies, database credentials, or signed URLs.
- Workspace, user, customer, private-space, conversation, file, or channel identifiers from a real run.
- `mapping.private.json`, `posted.private.json`, or `feedback.private.json`.
- Raw transcripts, generated output source, screenshots, or usage exports.
- Private share links, even if they only work for signed-in workspace members.

Supply credentials through environment variables or an approved secret manager. A local credentials
file must be ignored by git, access-restricted (mode `0600`), and excluded from shared run archives.
Keep generation and admin-export keys separate; never log their values. Verify ignored status before
adding files. For legacy OAuth, use one refreshing process at a time if refresh tokens rotate.

Before sharing a run directory, remove the private mapping and scan every text file for credentials,
identifiers, email addresses, and signed URLs. Treat the de-blinding mapping as confidential until the
voting window and blind qualitative review have closed.

Use a dedicated Slack channel. Preview one real post before bulk posting. Cleanup/deletion helpers
require a separate explicit decision; they are never an automatic recovery step. Private Forms must
not expose response summaries or other reviewers' rankings.
