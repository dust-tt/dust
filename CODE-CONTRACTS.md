# Code Contracts

Use the `code-contracts` skill for every code change and code review. Follow its contract discovery,
writing, and enforcement procedures before submitting commits or pull requests.

This code-base pre-existed code contracts and thefore can lack important contracts. When making, as
part of a code change, an important assumptions about a component's or function's behavior that is
not covered by an existing code contract, create a new code contract for that component and check
that existing callers comply to the new contract.

**Well-known labels:**

- `coding`: general coding conventions, simplicity, and consistency.
- `product`: product and business logic related contracts.
- `security`: contracts on which our security rely, whose enforcement is critical.
- `performance`: performance and reliability related contracts.
- `error-handling`: error propagation, catching, and normalization.
- `backend`: resources, database access, serialization, and business logic.
- `api`: routing, middleware, validation, and HTTP responses.
- `audit-logging`: audit events, actors, metadata, and schema consistency.
- `mcp`: MCP server structure, tool outputs, and descriptions.
- `testing`: test coverage, placement, factories, and resource usage.
- `react`: component props, fetching, loading states, and references.
- `rust`: Rust language safety and error handling.
- `swift`: Swift type safety, serialization, and framework usage.
- `cli`: command organization and file structure.
- `architecture`: abstraction boundaries and component responsibilities.
- `concurrency`: thread dispatch and retained-resource cleanup.
- `logging`: logging APIs and structured diagnostics.

Use semicolon-separated labels when multiple categories apply, such as
`label:audit-logging;security`.
