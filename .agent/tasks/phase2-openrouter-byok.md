# Phase 2 Tasks: OpenRouter BYOK

**Spec Reference:** [02-openrouter-byok.md](../specs/migration/02-openrouter-byok.md)

## Task Overview

| Task | Description | Dependencies | Effort |
|------|-------------|--------------|--------|
| 1 | Database Schema | None | Small |
| 2 | Encryption Infrastructure | Task 1 | Small |
| 3 | OAuth API Routes | Task 2 | Medium |
| 4 | Chat Route Integration | Task 3 | Small |
| 5 | Testing & Validation | Task 4 | Medium |

---

## Task 1: Database Schema

**Goal:** Add `user_api_keys` table to store encrypted OpenRouter keys.

### Subtasks
- [x] 1.1 Add `userApiKeys` table to `lib/db/schema.ts`
- [x] 1.2 Generate migration with `drizzle-kit generate`
- [x] 1.3 Run migration against dev database
- [x] 1.4 Verify table created in `ai` schema
- [x] 1.5 Export `userApiKeys` from `lib/db/index.ts`

### Schema Definition
```typescript
export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  openrouterKeyEncrypted: text('openrouter_key_encrypted').notNull(),
  openrouterKeyHash: text('openrouter_key_hash').notNull(),
  keyLabel: text('key_label'),
  creditsRemaining: numeric('credits_remaining'),
  creditsLimit: numeric('credits_limit'),
  isFreeTier: boolean('is_free_tier').default(true),
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

### Deliverables
- Updated `lib/db/schema.ts`
- Updated `lib/db/index.ts` exports
- `drizzle/migrations/` - New migration file

---

## Task 2: Encryption Infrastructure

**Goal:** Create encryption utilities for secure API key storage.

### Subtasks
- [x] 2.1 Create `lib/crypto/encryption.ts` with `encryptApiKey` function
- [x] 2.2 Create `decryptApiKey` function
- [x] 2.3 Add `ENCRYPTION_KEY` to `.env.example` (note: `.env*` is gitignored; documented in .env.local)
- [x] 2.4 Generate encryption key for dev environment
- [x] 2.5 Write unit tests for encryption round-trip

### Implementation Notes
- Use AES-256-GCM (authenticated encryption)
- Format: `iv:authTag:ciphertext` (all base64)
- Key from `ENCRYPTION_KEY` env var (32 bytes, base64 encoded)

### Environment Variables
```bash
ENCRYPTION_KEY=             # Generate with: openssl rand -base64 32
```

### Deliverables
- `lib/crypto/encryption.ts`
- `lib/crypto/index.ts` (exports)
- `__tests__/lib/crypto/encryption.test.ts`
- Updated `.env.example`

---

## Task 3: OAuth API Routes

**Goal:** Implement OpenRouter OAuth PKCE flow endpoints.

### Subtasks
- [x] 3.1 Create `app/api/openrouter/connect/route.ts` (GET - initiate OAuth)
- [x] 3.2 Create `app/api/openrouter/callback/route.ts` (GET - handle callback)
- [x] 3.3 Create `app/api/openrouter/status/route.ts` (GET - connection status)
- [x] 3.4 Create `app/api/openrouter/disconnect/route.ts` (DELETE - remove key)
- [x] 3.5 Add auth checks to all endpoints
- [x] 3.6 Implement PKCE challenge generation (SHA-256)
- [x] 3.7 Implement secure cookie for code_verifier storage
- [x] 3.8 Implement OpenRouter token exchange
- [x] 3.9 Implement key encryption before database storage
- [x] 3.10 Fetch and cache key metadata (credits, limits)

### Endpoint Summary
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/openrouter/connect` | Generate PKCE, redirect to OpenRouter |
| GET | `/api/openrouter/callback` | Exchange code for key, encrypt, store |
| GET | `/api/openrouter/status` | Return connection status + credits |
| DELETE | `/api/openrouter/disconnect` | Delete user's stored key |

### Environment Variables
```bash
NEXT_PUBLIC_APP_URL=        # For OAuth callback URL construction
```

### Deliverables
- `app/api/openrouter/connect/route.ts`
- `app/api/openrouter/callback/route.ts`
- `app/api/openrouter/status/route.ts`
- `app/api/openrouter/disconnect/route.ts`

---

## Task 4: Chat Route Integration

**Goal:** Modify chat route to use user's API key when available.

### Subtasks
- [x] 4.1 Add user key lookup to `app/api/chat/route.ts`
- [x] 4.2 Decrypt user key if found
- [x] 4.3 Fall back to shared key if no user key or decryption fails
- [x] 4.4 Pass correct key to `createOpenRouter()`
- [x] 4.5 Add error handling for invalid/revoked keys

### Code Changes
```typescript
// Before
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// After
let apiKey = process.env.OPENROUTER_API_KEY!;
const userKey = await db.query.userApiKeys.findFirst({
  where: eq(userApiKeys.userId, userId),
});
if (userKey) {
  try {
    apiKey = decryptApiKey(userKey.openrouterKeyEncrypted);
  } catch (error) {
    console.error('Failed to decrypt user API key, using shared key');
  }
}
const openrouter = createOpenRouter({ apiKey });
```

### Deliverables
- Updated `app/api/chat/route.ts`

---

## Task 5: Testing & Validation

**Goal:** Comprehensive testing of BYOK functionality.

### Subtasks - Unit Tests
- [x] 5.1 Test encryption/decryption round-trip
- [x] 5.2 Test PKCE challenge generation
- [x] 5.3 Test status endpoint responses (connected vs not connected)
- [x] 5.4 Test disconnect endpoint

### Subtasks - Integration Tests
- [x] 5.5 Test OAuth flow with mocked OpenRouter endpoints
- [x] 5.6 Test chat route uses user key when available
- [x] 5.7 Test chat route falls back to shared key
- [x] 5.8 Test invalid key handling

### Subtasks - Manual Testing
- [ ] 5.9 Full OAuth flow against real OpenRouter (dev account)
- [ ] 5.10 Verify chat works with user's own key
- [ ] 5.11 Verify disconnect removes key and falls back

### Deliverables
- `__tests__/lib/crypto/encryption.test.ts`
- `__tests__/api/openrouter/*.test.ts`
- Updated `__tests__/api/chat/route.test.ts`

---

## Execution Order

```
Task 1 (Database Schema)
    ↓
Task 2 (Encryption Infrastructure)
    ↓
Task 3 (OAuth API Routes)
    ↓
Task 4 (Chat Route Integration)
    ↓
Task 5 (Testing & Validation)
```

All tasks are sequential - each depends on the previous.

---

## Definition of Done

Phase 2 is complete when:
- [ ] All 5 tasks marked complete
- [ ] User can connect OpenRouter account via OAuth
- [ ] User's API key is encrypted at rest
- [ ] Chat uses user's key when connected
- [ ] Chat falls back to shared key when not connected
- [ ] User can disconnect and reconnect
- [ ] All unit tests pass
- [ ] No plaintext API keys in logs or responses

---

## Security Checklist

- [x] API keys encrypted with AES-256-GCM before storage
- [x] Code verifier stored in HttpOnly, Secure cookie
- [x] Decrypted keys never sent to frontend
- [x] Decrypted keys never logged
- [x] HTTPS enforced for OAuth redirects
- [x] PKCE prevents authorization code interception

---

## Notes

- Frontend integration (settings UI) deferred to separate task
- Credit refresh/sync can be added as future enhancement
- Consider rate limiting on connect endpoint to prevent abuse
