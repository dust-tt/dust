# [mobile] Coding Rules

## GENERAL

### [GEN1] Consistently bad is better than inconsistently good

Favor re-using existing patterns (with broad refactors if necessary) over introducing new ones
sporadically. Match the conventions already established in the codebase.

### [GEN2] Simple but good is better than perfect but complex

Favor simple and easy to understand approaches vs overly optimized but complex ones.

## SWIFT

### [SWIFT1] Never use force unwrap (`!`) or force cast (`as!`)

Force unwraps and force casts crash at runtime. Instead:

- Use `guard let` / `if let` for optionals
- Use `as?` with conditional binding for downcasts
- Use `throws` to propagate errors to callers

```swift
// BAD
let name = user.firstName!
let scene = connectedScenes.first as! UIWindowScene

// GOOD
guard let name = user.firstName else { return }
guard let scene = connectedScenes.first as? UIWindowScene else { return }
```

### [SWIFT2] Never use `try!` or `try?` silently

`try!` crashes on failure. `try?` silently discards the error. Instead:

- Use `do/catch` and handle or propagate the error
- `try?` is acceptable only when the failure case is explicitly handled (e.g., `guard let x = try? ... else { ... }`)

```swift
// BAD
let data = try! encoder.encode(body)
let _ = try? saveToKeychain(token)

// GOOD
let data = try encoder.encode(body)

do {
    try saveToKeychain(token)
} catch {
    logger.error("Keychain save failed: \(error)")
}
```

### [SWIFT3] No magic values

Don't scatter raw literals (strings, numbers, etc.) across the code when they carry domain meaning
or appear in multiple places. Extract them into named constants, enums, or defaulted properties.

```swift
// BAD
if retryCount > 3 { ... }
TokenRefreshRequest(grantType: "refresh_token", refreshToken: token)

// GOOD
private let maxRetries = 3
if retryCount > maxRetries { ... }

struct TokenRefreshRequest: Encodable {
    let grantType: String = "refresh_token"
    let refreshToken: String
}
```

### [SWIFT4] Use `Encodable`/`Decodable` over `[String: Any]`

Never use `[String: Any]` for JSON serialization. Define typed structs conforming to `Codable`
and use `JSONEncoder`/`JSONDecoder`. This ensures compile-time safety and eliminates key typos.

```swift
// BAD
let body: [String: Any] = ["code": code, "code_verifier": verifier]
request.httpBody = try JSONSerialization.data(withJSONObject: body)

// GOOD
struct TokenExchangeRequest: Encodable {
    let code: String
    let codeVerifier: String
}
request.httpBody = try encoder.encode(TokenExchangeRequest(code: code, codeVerifier: verifier))
```

### [SWIFT5] Check Security framework return values

`SecRandomCopyBytes`, `SecItemAdd`, `SecItemDelete`, and similar Security framework functions
return `OSStatus`. Always check the return value — never discard it with `_ =`.

```swift
// BAD
_ = SecRandomCopyBytes(kSecRandomDefault, buffer.count, &buffer)

// GOOD
let status = SecRandomCopyBytes(kSecRandomDefault, buffer.count, &buffer)
guard status == errSecSuccess else {
    throw AuthError.pkceGenerationFailed
}
```

## ARCHITECTURE

### [ARCH1] Views receive data and closures, not view models

Leaf views (views that don't own navigation) should receive data as plain values and actions as
closures. Only container/root views should hold `@EnvironmentObject` or `@StateObject`
references. This makes views testable, previewable, and decoupled from specific dependencies.

```swift
// BAD
struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
}

// GOOD
struct ProfileView: View {
    let user: User
    let onLogout: () -> Void
}
```

### [ARCH2] Respect abstraction layers

ViewModels should go through service interfaces, not reach into lower layers directly.
If `AuthService` wraps `KeychainService`, callers should use `AuthService` — never import
`KeychainService` from a ViewModel.

```swift
// BAD (in ViewModel)
let token = KeychainService.load(.accessToken)

// GOOD (in ViewModel)
let token = AuthService.loadTokens()?.accessToken
```

### [ARCH3] No dead code or no-op branches

Do not leave empty `if` blocks, commented-out logic, or branches that don't affect control flow.
Either implement the intended behavior or remove the branch entirely.

```swift
// BAD
if !AuthService.isTokenExpired() {
    // Token still valid — TODO: use directly
}
// falls through to refresh regardless

// GOOD — either skip refresh or remove the check
if !AuthService.isTokenExpired() {
    state = .authenticated(cachedUser)
    return
}
```

## CONCURRENCY

### [CONC1] Never call `DispatchQueue.main.sync` from the main thread

This deadlocks. If you need to assert you're on the main thread, use `MainActor.assumeIsolated`.
If you need to dispatch to main from a background thread, use `DispatchQueue.main.async` or
`@MainActor`.

### [CONC2] Clean up retained resources on all exit paths

Objects like `ASWebAuthenticationSession` that are retained by the view model must be nil'd out
on every terminal path (success, error, and cancellation) — not just the happy path.

## LOGGING

### [LOG1] Use `os.Logger` for all logging

Do not use `print()` or `debugPrint()`. Use `os.Logger` with the app subsystem and an
appropriate category. This ensures logs are filterable in Console.app and structured for
production diagnostics.

```swift
// BAD
print("Token refresh failed: \(error)")

// GOOD
private let logger = Logger(subsystem: "com.dust.mobile", category: "Auth")
logger.error("Token refresh failed: \(error)")
```
