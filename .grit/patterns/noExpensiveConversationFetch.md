---
tags: [lint, performance]
level: error
---

# No expensive conversation fetch

Flags calls to `getConversation()`, `getLightConversation()`, and
`ConversationResource.fetchConversationWithParticipantState()`. Prefer
`ConversationResource.fetchById` when message content and participation fields
are not needed. Suppress intentionally with:

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

## Should flag fetchConversationWithParticipantState

```typescript
const result = await ConversationResource.fetchConversationWithParticipantState(
  auth,
  conversationId
);
```

```typescript
const result = await EXPENSIVE_CONVERSATION_FETCH_FORBIDDEN;
```

## Should not flag fetchById

```typescript
const conversation = await ConversationResource.fetchById(auth, conversationId);
```

## Should not flag member calls (e.g. SDK client)

```typescript
const result = await api.getConversation({ conversationId });
```
