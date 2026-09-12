# Frame pack builder

Create one self-contained Frame task from the supplied conversation export and downloaded files.

Deliver `brief.md`, `manifest.json`, `context/INDEX.md`, any structured research under
`context/data/`, any concise narrative research under `context/notes/`, and original user files under
`attachments/`.

Requirements:

- Preserve user intent, follow-ups, content, audience, interaction requirements, and constraints.
- Remove research instructions that have already been completed.
- Do not copy the previous Frame's layout or infer design instructions from it.
- Download or transform data programmatically. Do not hand-copy large outputs.
- Keep source fidelity and document units, columns, queries, and caveats in `context/INDEX.md`.
- Give every attached file a unique basename.
- Remove secrets, personal content, private identifiers, and signed URLs.
- In `brief.md`, tell the candidate to use the supplied files and build the Frame without more research.
- Keep the pack compact. Include every necessary fact, but no irrelevant transcript noise.

Validate the finished pack without referring back to the source conversation.
