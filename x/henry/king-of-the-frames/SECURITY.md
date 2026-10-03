# Security and privacy

The repository contains tooling and synthetic examples only. Real packs, mappings, responses, Frame
URLs, conversation IDs, workspace IDs, usage exports, and reviewer identities stay in an ignored
working directory.

## Never commit

- API keys, OAuth access or refresh tokens, Slack tokens, cookies, database credentials, or signed URLs.
- Workspace, user, customer, private-space, conversation, file, or channel identifiers from a real run.
- `mapping.private.json`, `posted.private.json`, or `feedback.private.json`.
- Raw transcripts, generated Frame source, screenshots, or usage exports.
- Private share links, even if they only work for signed-in workspace members.

Supply credentials through environment variables or an approved secret manager. OAuth token files must
be outside the repository and mode `0600`. Use one token-refreshing process at a time if the identity
provider rotates refresh tokens.

Before sharing a run directory, remove the private mapping and scan every text file for credentials,
identifiers, email addresses, and signed URLs. Treat the de-blinding mapping as confidential until the
voting window and blind qualitative review have closed.

Use a dedicated Slack channel. Preview one real post before bulk posting. The included tool has no
channel-cleanup or deletion command; cleanup remains an explicit human action.
