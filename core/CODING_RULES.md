# [core] Coding Rules

## RUST

### [RUST1] Never use `unwrap`

The use of `unwrap()` is prohibited in the codebase as it can cause runtime panics and hard to debug errors. Instead:

- Use the `?` operator to propagate errors
- Use `ok_or_else()` to convert `Option` to `Result` with custom errors
- Use match statements to handle `Some(..)` and `None` cases

Example:

```rust
// BAD
let value = some_option.unwrap();

// GOOD
let value = match some_option {
    Some(v) => v,
    None => Err(anyhow!("failed to get value"))?,
};
```
