# Phase 2: OpenRouter BYOK (Bring Your Own Key)

**Status:** Draft

## Overview

Allow users to connect their own OpenRouter API key instead of using the shared application key. This enables users to:
- Use their own credits/billing
- Access models not available on the shared key
- Have full control over their API usage

**Goal:** Users can connect their OpenRouter account via OAuth, and their key is used for all AI requests.

## Current State

### AI SDK Configuration
- **Location:** `app/api/chat/route.ts`
- **Provider:** `@openrouter/ai-sdk-provider`
- **Key Source:** Environment variable `OPENROUTER_API_KEY` (shared)

```typescript
// Current implementation
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### User Model
- No `openrouter_key` field exists
- Users authenticated via Clerk (`userId` from JWT)

## Target State

### Database Schema

Add encrypted key storage to track user OpenRouter connections:

```sql
-- New table in 'ai' schema
CREATE TABLE ai.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,           -- Clerk user ID
  openrouter_key_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  openrouter_key_hash TEXT NOT NULL,      -- For OpenRouter API identification
  key_label TEXT,                         -- Display label (e.g., "sk-or-v1-...abc")
  credits_remaining NUMERIC,              -- Cached from OpenRouter
  credits_limit NUMERIC,                  -- Cached from OpenRouter
  is_free_tier BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_api_keys_user_id ON ai.user_api_keys(user_id);
```

### Drizzle Schema

```typescript
// lib/db/schema.ts (addition)
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
}, (table) => ({
  schema: pgSchema('ai'),
}));
```

### Encryption Strategy

Use AES-256-GCM with a server-side encryption key:

```typescript
// lib/crypto/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32 bytes, base64 encoded
const ALGORITHM = 'aes-256-gcm';

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decryptApiKey(encrypted: string): string {
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### OAuth PKCE Flow

#### Step 1: Initiate Connection

User clicks "Connect OpenRouter" → Frontend calls our API → API generates PKCE and redirects.

```typescript
// app/api/openrouter/connect/route.ts
import { auth } from '@clerk/nextjs/server';
import { randomBytes, createHash } from 'crypto';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate PKCE values
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Store code_verifier temporarily (Redis or encrypted cookie)
  // This example uses an encrypted cookie
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/openrouter/callback`;

  const authUrl = new URL('https://openrouter.ai/auth');
  authUrl.searchParams.set('callback_url', callbackUrl);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Return redirect URL and set verifier in secure cookie
  const response = Response.redirect(authUrl.toString());
  response.headers.set(
    'Set-Cookie',
    `openrouter_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  return response;
}
```

#### Step 2: Handle Callback

OpenRouter redirects back with authorization code.

```typescript
// app/api/openrouter/callback/route.ts
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { db, userApiKeys } from '@/lib/db';
import { encryptApiKey } from '@/lib/crypto/encryption';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.redirect('/sign-in');
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return Response.redirect('/settings?error=no_code');
  }

  // Retrieve code_verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('openrouter_verifier')?.value;

  if (!codeVerifier) {
    return Response.redirect('/settings?error=missing_verifier');
  }

  // Exchange code for API key
  const tokenResponse = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('OpenRouter token exchange failed:', error);
    return Response.redirect('/settings?error=exchange_failed');
  }

  const { key } = await tokenResponse.json();

  // Fetch key metadata
  const keyInfoResponse = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
  });

  const keyInfo = keyInfoResponse.ok
    ? (await keyInfoResponse.json()).data
    : null;

  // Encrypt and store
  const encrypted = encryptApiKey(key);
  const keyLabel = `sk-or-v1-...${key.slice(-8)}`;
  const keyHash = key.slice(0, 32); // OpenRouter provides hash, but we can derive

  await db
    .insert(userApiKeys)
    .values({
      userId,
      openrouterKeyEncrypted: encrypted,
      openrouterKeyHash: keyHash,
      keyLabel,
      creditsRemaining: keyInfo?.limit_remaining?.toString(),
      creditsLimit: keyInfo?.limit?.toString(),
      isFreeTier: keyInfo?.is_free_tier ?? true,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userApiKeys.userId,
      set: {
        openrouterKeyEncrypted: encrypted,
        openrouterKeyHash: keyHash,
        keyLabel,
        creditsRemaining: keyInfo?.limit_remaining?.toString(),
        creditsLimit: keyInfo?.limit?.toString(),
        isFreeTier: keyInfo?.is_free_tier ?? true,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  // Clear the verifier cookie
  const response = Response.redirect('/settings?connected=true');
  response.headers.set(
    'Set-Cookie',
    'openrouter_verifier=; HttpOnly; Secure; Max-Age=0; Path=/'
  );

  return response;
}
```

### Updated Chat Route

Modify chat to use user's key when available:

```typescript
// app/api/chat/route.ts (modified)
import { decryptApiKey } from '@/lib/crypto/encryption';
import { db, userApiKeys } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for user's own API key
  let apiKey = process.env.OPENROUTER_API_KEY!;

  const userKey = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
  });

  if (userKey) {
    try {
      apiKey = decryptApiKey(userKey.openrouterKeyEncrypted);
    } catch (error) {
      console.error('Failed to decrypt user API key:', error);
      // Fall back to shared key
    }
  }

  const openrouter = createOpenRouter({ apiKey });

  // ... rest of chat implementation
}
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/openrouter/connect` | Initiate OAuth PKCE flow |
| GET | `/api/openrouter/callback` | Handle OAuth callback |
| GET | `/api/openrouter/status` | Get connection status + credits |
| DELETE | `/api/openrouter/disconnect` | Remove user's API key |

### Status Endpoint

```typescript
// app/api/openrouter/status/route.ts
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userKey = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
  });

  if (!userKey) {
    return Response.json({
      connected: false,
      usingSharedKey: true,
    });
  }

  // Optionally refresh credits from OpenRouter
  // (could be done on a schedule instead)

  return Response.json({
    connected: true,
    usingSharedKey: false,
    keyLabel: userKey.keyLabel,
    creditsRemaining: userKey.creditsRemaining,
    creditsLimit: userKey.creditsLimit,
    isFreeTier: userKey.isFreeTier,
    connectedAt: userKey.connectedAt,
    lastVerifiedAt: userKey.lastVerifiedAt,
  });
}
```

### Disconnect Endpoint

```typescript
// app/api/openrouter/disconnect/route.ts
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await db.delete(userApiKeys).where(eq(userApiKeys.userId, userId));

  return Response.json({ success: true });
}
```

## Frontend Components

### Settings Page Addition

```typescript
// components/Settings/OpenRouterConnection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

type ConnectionStatus = {
  connected: boolean;
  usingSharedKey: boolean;
  keyLabel?: string;
  creditsRemaining?: string;
  creditsLimit?: string;
  isFreeTier?: boolean;
  connectedAt?: string;
};

export function OpenRouterConnection() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/openrouter/status')
      .then(res => res.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = () => {
    window.location.href = '/api/openrouter/connect';
  };

  const handleDisconnect = async () => {
    await fetch('/api/openrouter/disconnect', { method: 'DELETE' });
    setStatus({ connected: false, usingSharedKey: true });
  };

  if (loading) return <div>Loading...</div>;

  if (status?.connected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>Connected to OpenRouter</span>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Key: {status.keyLabel}</p>
          {status.creditsLimit && (
            <p>Credits: {status.creditsRemaining} / {status.creditsLimit}</p>
          )}
        </div>
        <Button variant="outline" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect your OpenRouter account to use your own API credits.
      </p>
      <Button onClick={handleConnect}>
        Connect OpenRouter
      </Button>
    </div>
  );
}
```

## Environment Variables

```bash
# New required variables
ENCRYPTION_KEY=           # 32-byte key, base64 encoded (openssl rand -base64 32)
NEXT_PUBLIC_APP_URL=      # e.g., https://studybuddy.app (for callback URL)

# Existing
OPENROUTER_API_KEY=       # Shared fallback key
```

## Security Considerations

1. **Encryption at Rest:** API keys encrypted with AES-256-GCM before database storage
2. **Secure Transport:** All OAuth redirects use HTTPS
3. **PKCE Protection:** SHA-256 code challenge prevents authorization code interception
4. **HttpOnly Cookies:** Code verifier stored in HttpOnly cookie during OAuth flow
5. **No Client Exposure:** Decrypted keys never sent to frontend
6. **Key Rotation:** Users can disconnect/reconnect to rotate keys
7. **Audit Logging:** Consider logging connection/disconnection events (not keys)

## Error Handling

| Scenario | Handling |
|----------|----------|
| OAuth flow interrupted | Redirect to settings with error param |
| Code exchange fails | Log error, redirect with `error=exchange_failed` |
| Decryption fails | Log error, fall back to shared key |
| User key invalid/revoked | Detect on API error, prompt reconnection |
| OpenRouter rate limited | Surface error to user, suggest waiting |

## Testing Strategy

### Unit Tests
- Encryption/decryption round-trip
- PKCE challenge generation
- Database operations (insert, update, delete)

### Integration Tests
- Full OAuth flow (mock OpenRouter endpoints)
- Chat route uses correct key
- Status endpoint returns correct state

### E2E Tests
- Connect flow UI interaction
- Disconnect flow
- Settings page displays correct status

## Migration Notes

1. Generate `ENCRYPTION_KEY` for each environment
2. Run Drizzle migration to create `user_api_keys` table
3. Deploy with feature flag initially (optional)
4. Monitor for decryption errors in logs

## Future Enhancements

- **Credit refresh cron:** Periodically update cached credits
- **Low credit alerts:** Notify users when credits are low
- **Multiple keys:** Support multiple OpenRouter keys per user
- **Key health check:** Verify key validity on app start
