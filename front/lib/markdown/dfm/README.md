# DFM: Dust-Flavored Markdown

DFM is the file format behind co-edition, named the way GFM names GitHub's flavor: a Markdown
document that humans edit in the rich editor and agents edit as text with ordinary tools,
carrying its comments inside the file. This module is
the codec: it turns a file into a `DfmDocument` and back, strictly, and never touches
what it does not define.

## The format

A DFM file is three parts, in this order: front matter between `---` fences, the body, and an
`:::annotations` block. Only the body is the document; the other two are optional and carry
data about it. This is a complete, valid file:

```md
---
title: The Pencil Case Manifesto
---

# The Pencil Case Manifesto

:comment-start{id=c1}A good pencil case holds exactly three things: a fountain pen,
a pencil sharpened by hand, and a rubber that has never been used.:comment-end{id=c1}

Notebooks are chosen by paper weight first and cover color second.
:comment-start{id=c2}Anything under 80 g/m² is a napkin.:comment-end{id=c2}

:::annotations
::comment{id=c1 status=open}

::message{author=user:usr_yuka name="Yuka" at=2026-09-25T14:16:32.380Z}

Three things? My pencil case has eleven pens and a tiny stapler.

::message{author=agent:dust name="@dust" at=2026-09-25T14:17:00.955Z}

Three is a manifesto. Eleven is a drawer.

::comment{id=c2 status=resolved}

::message{author=user:usr_daph name="Daph" at=2026-09-25T14:18:10.000Z}

Harsh but fair.
:::
```

A reader of the rendered document sees the title, two paragraphs, and two highlighted spans:
the first sentence of the first paragraph, and the last sentence of the second. Clicking the
first highlight opens a thread where Yuka asked a question and the `@dust` agent answered.
The second thread is resolved, so it is not highlighted.

**1. Front matter** is YAML between `---` fences on the first line. The codec keeps it as a raw
string and never interprets it; themes, templates and titles will live there. A file whose
first line is `---` but has no closing fence has no front matter: the line is a thematic break
in the body.

**2. Body** is ordinary Markdown with one addition: a commented span is wrapped in
`:comment-start{id=x}` and `:comment-end{id=x}`. The id is the only thing on the anchor; the
thread it points to lives in part 3. Two anchors may overlap, and one pair may span several
paragraphs or a whole list, since each is a single pair wherever it starts and ends. Anything
inside a fenced code block or a code span is text, not a directive, so this README's own
examples would survive inside a DFM file. Everything the codec does not define passes through
untouched. Images are ordinary Markdown too: a document shows a file of its conversation or pod
with its path as the destination, `![Revenue](pod-<id>/charts/revenue.png)`, or a file by its id,
`![Chart](fil_<id>)`. A file of the conversation or pod is referenced inline with the
`:preview_file` directive agents also write in messages,
`:preview_file{path="pod-<id>/reports/q3.pdf" title="Q3 report"}`, which the codec passes through
like any other.

**3. Annotations** is a `:::annotations` container at the very end of the file. It holds one
`::comment{id status}` per thread, `status` being `open` or `resolved`, followed by one
`::message{author name at}` per message. `author` is `user:<id>` or `agent:<id>`, so a thread
always says whether a human or an agent wrote each message; `name` is the display name in
quotes; `at` is an ISO 8601 timestamp with seconds and a zone. A message body is the Markdown
that follows until the next directive, and may have several paragraphs. The first message is
the comment itself, the rest are replies. A thread may exist with no anchor in the body, for
instance when the commented text was deleted; an anchor with no thread is an error.

A message may also carry `sig`, the server's Ed25519 signature in base64url over
`messageSignaturePayload` in `signatures.ts`: workspace, file path, comment id, the message's
position in the thread and the message before it, author, name, timestamp and body, not the status. A copy into another
file, a rename or a reordering therefore reads as unverified. The server writes and signs a
message when a signed-in user posts it or an agent calls the `documents.add_comment` tool, and
refuses a save through the file API that brings a new message it did not sign for the saving user
at that place, or moves a verified one; a message without a valid `sig`, such as one written from
a sandbox or by a plain file edit, is unverified. The codec carries the attribute and never checks it, so nothing here proves who
wrote a message. `tests/fixtures/signed_comments.md` shows one.

A message may suggest a change, as on GitHub: a fenced code block whose language is
`suggestion` holds the Markdown that would replace the commented text, and an empty block
suggests deleting it. Code fences already keep their lines out of the annotations grammar, so a
suggestion is ordinary message text to the codec, signed like the rest of the body.
A message may hold several, such as alternatives; `readMessageSuggestions` reads them in order
with the text around them. `tests/fixtures/suggested_change.md` shows one.

````md
::message{author=agent:dust name="@dust" at=2026-10-05T09:13:02.500Z}

The last fix lands Thursday night.

```suggestion
Ship on **Friday**.
```
````

**How an agent reads it.** Text first: the body reads as Markdown with a few directives. To
find what a comment is about, follow the id from `::comment` to the anchors. To answer a
comment, append a `::message` line and a body to its thread; to propose new wording for the
commented text, put it in a `suggestion` block in that body. To comment on new text, wrap the
span in anchors and add a thread, or call `anchorComment` with the quoted words and let the
codec place the anchors.

**What the codec guarantees.** Parsing is strict: a malformed file fails with a message and the
offending line, never a partial document. Serialization writes only what parses back
identically, and reparses its own output to prove it. These rules are the `@cc` contracts on
the public functions: `dfm-body-opaque` and `dfm-strict-parse` on `parseDfm`, `dfm-round-trip`
on `serializeDfm`, `dfm-anchor-integrity` on `extractAnchors` and `dfm-anchor-by-quote` on
`anchorComment`.

`tests/fixtures/pencil_case_manifesto.md` is the canonical example, a longer version of the file
above. Every file in `tests/fixtures/` is reproduced byte for byte by the serializer, and the pencil
case file is the one to hand an agent to check that it can read and edit the format.

## Public API

Import from `@app/lib/markdown/dfm` in front and front-api, and from
`@dust-tt/front/lib/markdown/dfm` in front-spa.

| Function | Purpose |
| --- | --- |
| `parseDfm(source)` | Source to `DfmDocument`, or a located error. |
| `serializeDfm(document)` | Document to canonical source, or the reason it cannot be written. |
| `extractAnchors(body)` | The body without anchor directives plus `{ id, start, end }` offsets into it in document order, for the editor and search. |
| `anchorComment({ body, id, quote, nth })` | Wraps the nth occurrence of `quote` in a new anchor pair, for agents that quote words instead of computing offsets. |
| `dfmCommentSchema` | The zod schema of a `DfmComment`, exactly, refusing unknown keys, for callers that keep threads outside the codec and read them back. |

Every function above returns a `Result` from `@app/types/shared/result`; `dfmCommentSchema` is
a schema, not a function. The editor's Markdown parser and serializer read and write anchors one
at a time, with the first three helpers below, which keep the directive's spelling in this
module; the next one is shared by message signing, and the last two by suggestions:

| Function | Purpose |
| --- | --- |
| `readAnchorDirective(source)` | The well-formed anchor directive at the very start of `source` with its `kind`, `id` and `length`, or null. |
| `findAnchorDirective(source)` | Index of the first anchor directive syntax in `source`, or -1. |
| `anchorDirective(kind, id)` | The directive text for one end of an anchor pair. |
| `messageSignaturePayload({ workspaceId, filePath, commentId, position, previous, message })` | The exact string a message signature covers, for the server that signs and the browser that checks. |
| `readMessageSuggestions(body)` | The message's text and suggested replacements, in order, null without a suggestion, or a located error out of the input bounds. |
| `suggestionBlock(markdown)` | The fenced block suggesting `markdown`, with a fence longer than any backtick run in it, or a located error out of the input bounds. |

Nothing here touches the network, the database or React: the module runs on the server and in
the browser, next to the `:preview_file` directive codec in `lib/markdown/file_preview.ts`.

## Module map

| File | Owns |
| --- | --- |
| `types.ts` | The public types. |
| `grammar.ts` | What every directive shares: the file fences and tokens, the directive-line pattern, the `{key=value}` tokenizer and validator. |
| `parser.ts` | What the codec asks a real Markdown parser: where code is, whether a fence is open, the block structure, the top-level code blocks in a language. |
| `anchors.ts` | The `:comment-start` / `:comment-end` directives: pattern, schema, builder, and scanning and pairing them in the body. |
| `annotations.ts` | The `::comment` and `::message` directives: value rules, schemas, builders, and parsing, validating and serializing the block. |
| `operations.ts` | Editing operations on a body, such as `anchorComment`. New operations go here. |
| `signatures.ts` | What a message signature covers. Signing and checking live with their callers. |
| `suggestions.ts` | The `suggestion` blocks in a message body: reading them and writing one. |
| `document.ts` | The whole-file layout: front matter, body, block. Each parse rule has its mirror in the serializer's validation. |
| `index.ts` | The public surface. |

Tests live in `tests/` and mirror the split, one file per module, with shared fixtures and
helpers in `tests/dfm.test_utils.ts`. Each "refuses to serialize" table names the file whose
checks it covers. `tests/bounds.test.ts` checks the input bounds across the public API against
a spied parser.

## Adding a directive

Suggestions are the next one. The steps are the same for any directive:

1. Add its types to `types.ts`.
2. Define its markers in `anchors.ts` and its thread directive in `annotations.ts`: pattern,
   schema and builder next to the code that parses and serializes them. `grammar.ts` and
   `parser.ts` should not need to change.
3. Add a fixture file for it under `tests/fixtures/`, so the canonical example of each feature
   stays readable on its own, and add its rejection cases to the matching test file.
4. Update the format section above.

## Known limits

- Two anchors starting at the same offset: `anchorComment` places the new start marker before
  the existing one. The editor's own serializer must use the same rule for byte-for-byte
  equality.
- A file starting with a `---` rule and containing another `---` line is read as front matter.
- Code positions and block structure come from `mdast-util-from-markdown`, so anchors inside
  fenced, indented and quoted code blocks and code spans are text, and `anchorComment` refuses
  an insertion that would change the parse tree, a node's properties included: a quote inside
  a link destination, an image's alt text or raw HTML is refused. HTML blocks are not treated as code: a
  directive inside raw HTML is interpreted. GFM extensions such as tables and autolink
  literals are not parsed, so a directive inside them is interpreted too.
- A backslash before an anchor escapes it, as CommonMark does for any punctuation:
  `\:comment-start{id=x}` is text. The codec applies this everywhere outside code, including
  raw HTML and autolinks where CommonMark would not. An escaped anchor whose pair is live is
  an error.
- A leading UTF-8 byte order mark is dropped on parse and never written back.
- Input is bounded before parsing (`INPUT_LIMITS` in `parser.ts`): 256k characters, 256
  characters of quote markers, list markers and indentation opening a line, 15k emphasis, link
  and code delimiters, 15k list items. The Markdown parser is quadratic on the shapes these
  bound; within them a parse takes about a second at worst. Delimiters are counted inside code
  blocks too, so a very large, code-heavy or heavily formatted document can reach a count and
  is then refused with the reason. A server calling the codec on untrusted input still needs
  its own isolation, since a second of blocked event loop per call is not free.
- The codec does not authenticate authors. `author=user:<id>` is data; any file writer can put
  any id there. Whoever stores a file decides what to trust; see the design notes in
  `x/daph/co-edition/README.md`.
