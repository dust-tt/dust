- High: live secret updates need failure semantics. The doc says front rewrites /run/dust/
    egress-secrets.json on every active sandbox and dsbx reloads via inotify, but it does
    not say what happens if a sandbox is sleeping, unreachable, write fails, or dsbx reload
    sees a partial/invalid file. For rotation/deletion, best-effort is not enough; stale
    files can keep old secrets usable. Add atomic write/rename, dsbx fail-closed reload
    behavior, and a policy for failed sandbox propagation. See SECRET_SWAP_DESIGN.md:594,
    current wake paths in front/lib/resources/sandbox_resource.ts:487, and write errors in
    front/lib/resources/sandbox_resource.ts:804.
  - Medium: rotation semantics are still ambiguous with env immutability. The doc says
    rotation generates a new placeholder nonce, and live update propagates rotated values,
    but running sandbox env vars still contain the old placeholder. Either old placeholders
    should fail until a new sandbox/exec env exists, or dsbx must keep old-placeholder to
    new-value mappings. Those are different security semantics. See
    SECRET_SWAP_DESIGN.md:103 and SECRET_SWAP_DESIGN.md:602.
  - Medium/Low: the goals still say “No agent code changes required”, but the updated design
    intentionally uses DSEC_* and requires SDK aliasing for common clients. That is a
    reasonable tradeoff, but the goal should be softened to match the resolved decision. See
    SECRET_SWAP_DESIGN.md:35 versus SECRET_SWAP_DESIGN.md:625.
  - Low: URL substitution remains under-specified. Secret value validation now handles
    header injection, but Phase 1 still says “headers + URL”; URL substitution needs
    context-specific rules for reserved characters/spaces or should be explicitly deferred.
    See SECRET_SWAP_DESIGN.md:210 and SECRET_SWAP_DESIGN.md:571.
