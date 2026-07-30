# Agent Message Consumption

This context explains the recognizable work that contributed to an agent message's credit consumption without participating in billing.

## Language

**Billed credits**:
The authoritative credits charged for an agent message.
_Avoid_: Attributed credits, estimated credits

**Consumption attribution**:
A versioned explanation that maps model usage and tool executions to recognizable categories of work.
_Avoid_: Bill, billing calculation

**Attribution item**:
One versioned semantic contribution to an agent message's consumption attribution.
_Avoid_: Charge, invoice line

**Gross attributed credits**:
An attribution item's estimated token footprint converted to credits without cache effects, plus any direct tool credits assigned to the item.
_Avoid_: Billed credits, actual cost

**Tool output tokens**:
The estimated model-output tokens used to emit a tool call, including its name and parameters.
_Avoid_: Tool result tokens

**Tool input tokens**:
The estimated model-input footprint of the result produced by a tool execution.
_Avoid_: Tool parameter tokens

**Cache effect**:
The message-level difference between gross attributed credits and billed credits.
_Avoid_: Attribution item, billing adjustment row

## Module boundary

The attribution module owns semantic partitioning, normalization, cache-naive pricing, completion checks, and the read projection. The resource owns workspace-scoped persistence, idempotency, and pending-to-complete transitions.

An item identity is append-only during normal operation. Only a tool item interrupted before execution may be pending. Its emitted-call footprint and run provenance stay fixed while result and direct-credit evidence are added when the tool becomes final. Once completed, the row is immutable. Conversation deletion removes attribution rows explicitly before deleting their owners.

The agent loop returns only the association between an emitted tool action and its `RunUsage`. Temporal carries that evidence, the message lifecycle snapshot, and historical direct-credit evidence to the existing background analytics workflow. Database writes, remote tokenization, and result inspection happen there and retry independently from execution and billing. The lifecycle snapshot prevents a delayed approval materialization from interpreting newer mutable action state as evidence from its own execution.
