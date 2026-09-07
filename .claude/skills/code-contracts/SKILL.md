---
name: code-contracts
description: Define, use, and enforce @cc code-contracts across a codebase.
---

# Code Contracts

A simple open format for specifying structured assumptions and requirements about code to support
faster and better agent-driven software development.

```typescript
/**
 * @cc [owner:spolu,label:product] balance-pre-and-fail
 * `from.balance` is expected to be greater than or equal to `invoice.amount`, fails with
 * `InsufficientBalanceError` otherwise.
 */
/**
 * @cc [owner:spolu,label:product] balance-post
 * `from.balance` is decreased by `invoice.amount` and `invoice.status` is set to `paid`.
 */
/**
 * @cc [owner:spolu,label:product] atomicity
 * The operation is atomic: either `from.balance` is decreased and `invoice.status` is set to
 * `paid`, or neither is changed.
 */
export async function payInvoice(
  invoice: Invoice,
  from: Account,
): Promise<PaidInvoice> {
 ...
}
```

## Why code contracts?

Code contracts are written and used by both humans and agents to reason about code.

They serve three main purposes:

**Specification**: Compared with separate product or system specification files, which tend to
drift from code and are harder to discover, code contracts are embedded locally. Humans use them to
reason about behavior without having to inspect implementation details. Agents use them to guide
implementations and surface important assumptions to humans and future agents.

**Attention**: They reduce the cycles required to reason about code by surfacing important
assumptions and invariants in a structured way, freeing one of the most bottlenecked resources in
modern software development teams: human attention.

**Verification**: Their structure and granularity enable tooling to enforce compliance and ease
maintenance over time. Code contract enforcement provides a verification signal to agents that
improves their performance.

Code contracts enable:

- More efficient collaboration between human developers and coding agents.
- Generative code analysis and verification that improves agent performance.
- Maintenance at scale of invariants, product contracts, and security assumptions at code level.

## Tooling

```sh
npm install --global @spolu/cc-check
```

The `cc-check` command-line interface provides:

- `cc-check format [file-like]`: reports malformed `@cc` syntax and duplicate contract IDs in a
  supported source or `CONTRACTS` file. Without a path, it recursively inspects every supported file
  in the current directory. It never rewrites files or assesses contract prose or implementation
  compliance.
- `cc-check list <file-like|location-like>`: lists contracts attached to declarations throughout a
  supported source file, or contracts applicable to the declaration containing a source location
  and its declaration ancestors. Directory-scoped contracts from ancestor `CONTRACTS` files are
  included by default; pass `--no-global` to exclude them.

```text
cc-check format
cc-check format path/file.rs
cc-check list path/to/file.ts:42
cc-check list path/to/file.go
```

## Specification and grammar

`@cc` directives are extracted from documentation comments in any supported source language. Each
directive defines one code contract. Contracts are generally colocated with or within function,
class, or method definitions.

Code contracts that are not attached to a declaration live in a file named `CONTRACTS`. They apply
to all code contained in the directory where that file lives and its descendant directories. Their
typical use case is expressing directory-scoped coding rules, such as architectural boundaries,
dependency constraints, or security practices.

`CONTRACTS` file example:

```text
@cc [owner:spolu,label:architecture] database-access-thru-resources
Database accesses must happen exclusively through `Resource`-like interfaces.

@cc [owner:spolu,label:security] no-sensitive-data-logging
Credentials, tokens, secrets and user data must not be logged.
```

The grammar uses ISO-style EBNF. `SP` is one or more spaces and `NL` is a line break. Comment
delimiters and decorations such as `/**`, `*/`, `//`, `///`, Python docstring triple quotes, and
leading `*` are removed before parsing.

```ebnf
contracts_file
              = { contract, NL } ;
contract      = directive, NL, prose ;
directive     = "@cc", SP, [ metadata, SP ], contract_id ;

metadata      = "[", attribute, { ",", attribute }, "]" ;
attribute     = key, ":", value ;

contract_id   = token ;
key           = token ;
value         = token ;
prose         = prose_line, { NL, prose_line } ;
```

`token` is a non-empty sequence without whitespace, commas, colons, or square brackets. Metadata
keys are extensible; `owner` and `label` are initially well-known. A contract may have multiple
owners and labels. Prefer `;` to separate values within an attribute instead of repeating its key:
`[owner:spolu;tdraier,label:product]` instead of
`[owner:spolu,owner:tdraier,label:product]`, or `label:product;security` for multiple labels.
Repeated keys remain valid. Semicolon-separated lists are a metadata convention; the parser
preserves each value as a single token. `prose_line` is any line that does not begin with an `@cc`
directive.

The prose body is non-empty and extends to the end of the documentation comment, the next `@cc`
directive in a `CONTRACTS` file, or the end of that file. It may contain any text and span any
number of lines. The core format does not prescribe vocabulary, sentence shape, modality, or a
requirements notation, but Markdown is generally expected.

A documentation comment contains one `@cc` directive. Multiple consecutive contract comments may
attach to the same declaration. Contract IDs are unique and stable within the declaration to which
they are attached; the same ID may be used on a different declaration. Contracts in a `CONTRACTS`
file are not attached to a declaration, and their IDs are unique and stable within that file and
across all parent `CONTRACTS` files.

The identity of an attached contract is the language-specific identity of its declaration plus its
contract ID. The identity of a directory contract is the repository-relative path of its `CONTRACTS`
file plus its contract ID.

## Code contracts workflow

### Discovering contracts

Before changing or reviewing code, identify the contracts that govern the target. You can do so
manually or with the `cc-check list` command.

Treat all applicable local and directory contracts as simultaneous obligations. Surface conflicting,
obsolete, or impossible contracts instead of choosing one silently.

### Writing contracts

Code contracts are effective when they are simple, concise, and precise. Place a
declaration-specific contract in that language's supported documentation comment or docstring. Place
a contract governing a directory tree in `CONTRACTS`, normally for architectural, security, or
coding constraints. Use the narrowest relevant declaration or directory boundary.

Each source documentation block contains exactly one contract. Keep contract IDs unique and stable
within their declaration. Keep `CONTRACTS` IDs unique and stable within that file and its parent
`CONTRACTS` files. Set `owner` to the current user's GitHub username; use their authenticated
GitHub identity when available, and ask rather than guessing when it cannot be determined. Multiple
owners are possible; prefer separating their usernames with `;` in a single `owner` attribute.
Use the same convention for multiple labels. Preserve established repository metadata conventions.

Validate contract syntax with `cc-check format`. The command reports malformed syntax and duplicate
IDs only. It does not prove that the prose is true or that code complies with it. You are responsible
for verifying contracts' validity and coherence and the code's compliance. Validate contract
discoverability with `cc-check list`.

Write contract prose so a human or agent reviewer can compare it directly with code:

- Express one durable obligation per contract. Split independent requirements.
- Prefer one concise, dense and clear sentence; add another only when a material exception or
  failure behavior needs stating.
- Name the subject and the observable behavior, outcome, boundary, or invariant.
- Use decisive language. Prefer `must`, `never`, or a direct present-tense invariant; use `should`
  only when discretion is intentional.
- Name relevant identifiers, states, errors, or boundaries precisely, using backticks where helpful.
- State preconditions, postconditions, failure behavior, atomicity, ordering, or side effects only
  when they are part of the expectation.
- Avoid vague terms such as "properly", "appropriately", "robust", "safe", or "as needed" unless
  the contract defines what they mean.
- Avoid rationale, implementation narration, examples, and restating types unless they materially
  constrain acceptable code.
- Do not encode speculative behavior or make a contract broader than the evidence or user intent.

For example, replace “Handles invalid amounts appropriately” with “`createInvoice` rejects a
non-positive amount with `InvalidAmountError` and does not persist the invoice.”

A well-written contract should read as a specification. It should:

- Be sufficient for consumers of the associated declaration to reason about its behavior.
- Avoid prescribing implementation details.

Use specification styles such as BCP 14 / RFC 2119, JML, TLA+, EARS, and Gherkin rather than typical
comments about code behavior.

### Enforcing contracts

You must ensure at all times that all discovered and introduced contracts related to a code change
are valid, coherent, enforced, and respected. There is no automated semantic enforcement of
contracts. Code changes are assumed to comply with all applicable contracts, so authors and
reviewers must verify that compliance.

Any contract violation is a finding. It must be fixed or surfaced clearly. Any contradictory
contracts are a finding. They must be reconciled or surfaced clearly.

When behavior intentionally changes, update the relevant contracts in the same change. Verify the
impact of the contract change on consumers of the associated declaration.

**CRITICAL REQUIREMENTS for all code changes**

- Discover and review applicable contracts before choosing the technical design.
- Introduce relevant contracts for new behavior.
- Backfill missing contracts when material assumptions about pre-existing code are made.
- Update or remove contracts for changed behavior.
- Reconcile the implementation, relevant tests, and contract prose after each meaningful change.
- When behavior intentionally changes, update the contract in the same change if that specification
  change is in scope.
- Never delete or weaken a contract merely to make an implementation appear compliant.
- Treat a code/contract mismatch as a finding. Fix it or surface it clearly; do not assume either
  side is automatically correct.
