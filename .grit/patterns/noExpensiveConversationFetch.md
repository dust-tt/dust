---
tags: [lint, performance]
level: error
---

# No expensive conversation fetch

Flags calls to `getConversation()` and `getLightConversation()`, which load the
full conversation content and can be expensive. Prefer
`ConversationResource.fetchById` or `fetchConversationWithoutContent` when
message content is not needed. Suppress intentionally with:

```typescript
// biome-ignore lint/plugin/noExpensiveConversationFetch: <reason>
```

```grit
language js

expensive_conversation_fetch() => `EXPENSIVE_CONVERSATION_FETCH_FORBIDDEN`
```

## Should flag getConversation

```typescript
const result = await getConversation(auth, conversationId);
```

```typescript
const result = await EXPENSIVE_CONVERSATION_FETCH_FORBIDDEN;
```

## Should flag getLightConversation

```typescript
const result = await getLightConversation(auth, conversationId);
```

```typescript
const result = await EXPENSIVE_CONVERSATION_FETCH_FORBIDDEN;
```

## Should not flag ConversationResource helpers

```typescript
const conversation = await ConversationResource.fetchById(auth, conversationId);
const withoutContent =
  await ConversationResource.fetchConversationWithoutContent(
    auth,
    conversationId
  );
```

## Should not flag member calls (e.g. SDK client)

```typescript
const result = await api.getConversation({ conversationId });
```
