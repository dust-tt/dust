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
keys are extensible; `owner`, `notify`, and `label` are well-known. A contract may have multiple
owners, notification recipients, and labels. Prefer `;` to separate values within an attribute
instead of repeating its key:
`[owner:spolu;tdraier,label:product]` instead of
`[owner:spolu,owner:tdraier,label:product]`, or `label:product;security` for multiple labels.
Repeated keys remain valid. Semicolon-separated lists are a metadata convention; the parser
preserves each value as a single token. `prose_line` is any line that does not begin with an `@cc`
directive.

`owner` lists GitHub usernames to notify when an existing contract is changed or removed. Contract
introductions do not notify owners. `notify` lists GitHub usernames to notify on every discovered
violation of that contract.
For example, `[owner:spolu,notify:spolu;flvndvd,label:product]` notifies `spolu` about contract
changes and both `spolu` and `flvndvd` about violations. Owners are not automatically notified about
violations; include them in `notify` if they want both. Review agents split semicolon lists, combine
repeated keys, and deduplicate usernames.

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

For `$code-contracts verify`, follow [On-demand verification](#on-demand-verification).

### Discovering contracts

Before changing or reviewing code, identify every local, enclosing-declaration, and ancestor
`CONTRACTS`-file obligation governing the target, manually or with `cc-check list`. Resolve called
symbols and inspect their contracts too: a call can violate a contract declared in another file.

Treat all applicable local and directory contracts as simultaneous obligations. Surface conflicting,
obsolete, or impossible contracts instead of choosing one silently. Documentation examples and
intentionally malformed test fixtures are not production contract declarations.

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
Use the same convention for multiple labels and `notify` recipients. Set `notify` only when
explicitly requested by the user; do not infer it from `owner`. Preserve established repository
metadata conventions.

Validate contract syntax with `cc-check format`. The command reports malformed syntax and duplicate
IDs only. It does not prove that the prose is true or that code complies with it. You are responsible
for verifying contracts' validity and coherence and the code's compliance. Validate contract
discoverability with `cc-check list`.

Write each contract around a concrete obligation:

- **Identify the regression it prevents.** Name a plausible change that would violate the
  requirement. A statement that only describes the function's purpose belongs in ordinary
  documentation.
- **State an observable requirement.** Prefer "[condition,] subject MUST/MUST NOT satisfy
  requirement." Direct invariants are equally valid; normative keywords alone do not make prose
  precise.
- **Separate independent obligations.** Use one contract per requirement. Conditional cases
  defining a single requirement may share a contract.
- **Make decisive cases explicit.** Include missing-data, fallback, error, or side-effect behavior
  when it determines compliance. Distinguish returning no result from failing to obtain a result.
- **Specify the boundary precisely.** Identify the relevant inputs, outputs, fields, states, or
  effects. Turn phrases such as "workspace-wide" into explicit preconditions or guarantees when
  intended.
- **Preserve intent across implementations.** Omit purpose statements, rationale, and algorithm
  narration unless they impose an actual constraint. Do not promote incidental implementation
  behavior into a requirement without evidence of intent.

Before keeping a contract, check that a reviewer can identify both a concrete violation and an
alternative implementation that satisfies it.

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

### On-demand verification

When invoked as `$code-contracts verify`, or when a review workflow requests this procedure,
perform a read-only contract review. Read applicable repository instructions. Do not edit files or
post reviews or notifications unless separately requested.

Use the requested PR, revision range, file, or directory as the scope. Without an explicit scope,
review the current task's changes, including committed branch changes and staged, unstaged, and
untracked files. Infer the branch's comparison base from the task or repository context; ask for the
scope if no target or baseline can be established. A file or directory can be verified against its
current contracts without a diff. When a workflow supplies captured commits, use that exact
comparison even if the branch advances.

1. Inspect the diff and surrounding implementation, or the full selected code when no diff applies.
   For a commit comparison, use `git diff --find-renames <merge_base> <head_sha>` and
   `git show <merge_base>:<path>` for old code and contracts. Include local changes when in scope.
   Discover changed files locally even when a supplied file list may be truncated. Inspect additions,
   modifications, and the effects of deletions. Compare entire contract bodies and metadata;
   searching added `@cc` lines alone misses prose-only changes and removed contracts.
2. Apply [Discovering contracts](#discovering-contracts) to the code in scope. Validate relevant
   contract syntax with `cc-check format`; it checks syntax, not semantic validity or compliance.
   Use a caller-supplied `cc-check` executable when provided. If tooling is unavailable, inspect
   contracts manually and disclose any resulting verification limit.
3. Check each code element against its applicable contracts. Trace actual inputs, guards, errors,
   outputs, state changes, and side effects. Check contracts for validity and consistency with the
   implementation and with other applicable contracts. Report contradictions and evidenced
   mismatches; neither code nor contract is automatically correct. Do not excuse a violation
   because its contract was weakened or deleted in the same change. Distinguish an intentional,
   coherent specification change from a hidden regression.
4. For every introduced, changed, or explicitly targeted contract, inspect the implementing
   declaration and its consumers, including unchanged callers. Find callers and references with
   `rg` and source navigation. Trace imports, re-exports, aliases, wrappers, and type/member uses;
   confirm each match refers to the affected declaration. For directory contracts, inspect the
   affected code in their subtree and consumers of affected declarations.
5. At each inspected caller/reference, discover its own applicable contracts using
   `cc-check list <caller-location>` or manual inspection. Check both that the call respects the
   callee's contract and that the callee's changed guarantees keep the caller compliant with its
   own contracts. Follow evidence through wrappers; do not assume consumers are compatible.
6. Inspect at most 64 distinct callers/references per affected declaration, deduplicating overlapping
   callers and references. Prioritize changed callers, high-risk behavior, and diverse usage
   patterns. This also bounds further investigation through callers. Keep caller counts,
   uninspected scope, search limitations, and uncertain relationships in your working analysis.
   Disclose limitations that materially affect a conclusion, with the relevant finding when
   applicable. Never imply exhaustive verification when capped or blocked.

Reuse applicable validation results for the inspected revision. Respect sandbox restrictions; an
unavailable or failed tool alone is not evidence of a contract violation. Continue source analysis
and report material verification limits.

Use the invoking workflow's output format when specified. Otherwise, report concise findings with
the contract ID and declaration/file, exact source location, evidence, and consequence. Include
pre-existing violations found within scope and identify them as such; avoid speculative or unrelated
general review findings. If no violations are found, state that for the inspected scope, with any
material limitations.
