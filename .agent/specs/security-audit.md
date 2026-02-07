# Security Audit Report

**Status:** Accepted
**Date:** 2026-02-07
**Auditor:** Claude Code Security Audit
**Last Updated:** 2026-02-07 (Critical fixes applied)

---

## Executive Summary

This document presents findings from a comprehensive security audit of the StudyBuddy Frontend codebase. The audit identified **3 critical**, **5 high**, and **8 medium** severity issues across authentication, authorization, injection vectors, and file handling domains.

**Overall Assessment:** The codebase demonstrates strong foundational security practices with Clerk authentication, AES-256-GCM encryption for API keys, and proper ownership verification on most endpoints.

### Fixes Applied (2026-02-07)

The following critical vulnerabilities have been remediated:

| Issue | Fix | Files Modified |
|-------|-----|----------------|
| SQL Injection via Vector Literals | Added `formatVectorLiteral()` validation | `lib/db/vector-utils.ts` (new), `lib/ai/retrieval.ts`, `lib/documents/chunk-ingestion.ts`, `lib/lectures/pipeline.ts` |
| SSRF in Lecture Streaming | Added `validateStreamUrl()` with domain whitelist | `lib/lectures/url-validation.ts` (new), `app/api/lectures/stream/route.ts` |
| Unauthenticated Audio Access | Added Clerk auth, UUID validation, ownership check | `app/api/lectures/audio/[lectureId]/route.ts`, `proxy.ts` |

---

## Critical Vulnerabilities (FIXED)

### 1. SQL Injection via Vector Literals ✅ FIXED

**Severity:** CRITICAL (Remediated)
**CVSS:** 9.0 (Network/Low/None)
**CWE:** CWE-89 (SQL Injection)

**Affected Files:**
- `/lib/ai/retrieval.ts` (Lines 128, 151, 156, 185, 210, 214)
- `/lib/documents/chunk-ingestion.ts` (Lines 89, 94)
- `/lib/lectures/pipeline.ts` (Lines 131, 136)

**Vulnerability:**
Vector embedding arrays are interpolated into SQL via `sql.raw()` without validation:

```typescript
// VULNERABLE PATTERN
const vectorLiteral = `[${embedding.join(',')}]`;
const results = await db.execute(sql`
  SELECT ...
  ORDER BY embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}
`);
```

**Attack Vector:**
While embeddings originate from AI API responses (reducing direct attack surface), if an attacker can influence embedding source data, they could inject arbitrary SQL:
```
embedding = [1.0, "2.0'); DROP TABLE users; --"]
```

**Remediation:**
```typescript
// Validate embedding is numeric array
function validateEmbedding(embedding: unknown): number[] {
  if (!Array.isArray(embedding)) throw new Error('Invalid embedding');
  if (!embedding.every(n => typeof n === 'number' && !isNaN(n))) {
    throw new Error('Invalid embedding values');
  }
  return embedding;
}

const validEmbedding = validateEmbedding(embedding);
const vectorLiteral = `[${validEmbedding.join(',')}]`;
```

---

### 2. Server-Side Request Forgery (SSRF) in Lecture Streaming ✅ FIXED

**Severity:** CRITICAL (Remediated)
**CVSS:** 8.5 (Network/Low/None)
**CWE:** CWE-918 (Server-Side Request Forgery)

**Affected Files:**
- `/app/api/lectures/stream/route.ts` (Lines 50-90)
- `/lib/lectures/ffmpeg.ts` (Lines 209-214, 225-226)

**Vulnerability:**
User-supplied `streamUrl` is passed directly to FFmpeg without validation:

```typescript
// app/api/lectures/stream/route.ts
const { streamUrl } = body;
if (!streamUrl) { return Response.json({ error: 'streamUrl is required' }); }
// No URL validation!
downloadAndProcessLecture({ streamUrl, ... });

// lib/lectures/ffmpeg.ts
const ffmpeg = _spawn('ffmpeg', ['-i', streamUrl, ...]);
```

**Attack Vector:**
- Access internal resources: `file:///etc/passwd`
- Cloud metadata: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- Internal services: `http://localhost:8000/admin`
- Port scanning: `http://internal-service:PORT`

**Remediation:**
```typescript
function validateStreamUrl(url: string): boolean {
  const parsed = new URL(url);

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') return false;

  // Whitelist Panopto domains only
  const allowedHosts = ['panopto.com', 'cloud.panopto.com'];
  if (!allowedHosts.some(h => parsed.hostname.endsWith(h))) return false;

  // Block private IPs
  const privateRanges = [
    /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./, /^0\./, /^localhost$/i
  ];
  if (privateRanges.some(r => r.test(parsed.hostname))) return false;

  return true;
}
```

---

### 3. Unauthenticated Audio File Access ✅ FIXED

**Severity:** CRITICAL (Remediated)
**CVSS:** 7.5 (Network/Low/None)
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Affected Files:**
- `/app/api/lectures/audio/[lectureId]/route.ts` (Lines 1-47)
- `/proxy.ts` (Line 8)

**Vulnerability:**
Audio files are served without authentication, relying on UUID unpredictability:

```typescript
// proxy.ts:8 - Explicitly excluded from auth
"/api/lectures/audio(.*)",

// The endpoint serves files with only UUID check
export async function GET(_req: Request, { params }) {
  const { lectureId } = await params;
  const filePath = getTempAudioPath(lectureId);
  // No authentication! No ownership check!
  return new Response(stream, { headers: { 'Content-Type': 'audio/mp4' } });
}
```

**Attack Vector:**
- Enumeration attacks if any lecture ID is leaked
- Privacy violation for sensitive lecture content
- Data exfiltration of educational materials

**Remediation:**
```typescript
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { lectureId } = await params;

  // Verify ownership
  const userLecture = await db.query.userLectures.findFirst({
    where: and(eq(userLectures.userId, userId), eq(userLectures.lectureId, lectureId))
  });
  if (!userLecture) return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Serve file...
}
```

---

## High Severity Issues

### 4. Missing Course Enrollment Verification

**Severity:** HIGH
**CWE:** CWE-862 (Missing Authorization)

**Affected Routes:**
- `/api/documents` (GET) - Lines 162-192
- `/api/lectures` (GET) - Lines 19-73
- `/api/sessions` (POST) - Lines 38-70
- `/api/chat` (POST) - Lines 38-77

**Vulnerability:**
Users can access course resources without enrollment verification:

```typescript
// Current pattern - only checks userId, not enrollment
const docs = await db.query.documents.findMany({
  where: and(
    eq(documents.userId, userId),  // Checks ownership
    eq(documents.courseId, courseId)  // NO enrollment check
  ),
});
```

**Remediation:**
```typescript
// Add enrollment check before resource access
const enrollment = await db.query.userCourses.findFirst({
  where: and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)),
});
if (!enrollment) {
  return Response.json({ error: 'Not enrolled in this course' }, { status: 403 });
}
```

---

### 5. PKCE Verifier In-Memory Storage

**Severity:** HIGH
**CWE:** CWE-613 (Insufficient Session Expiration)

**Affected File:** `/lib/auth/pkce-store.ts` (Lines 14-31)

**Vulnerability:**
PKCE code verifiers are stored in a single-process Map:

```typescript
const verifierStore = new Map<string, VerifierEntry>();
```

**Issues:**
- Multi-instance deployments: Verifier created on instance A fails on instance B callback
- Data loss on restart: Pending OAuth flows break mid-process
- No persistence mechanism

**Remediation:**
Replace with Redis or database storage for production:
```typescript
// Use Redis for distributed deployments
await redis.setex(`pkce:${userId}`, 600, codeVerifier);
const storedVerifier = await redis.get(`pkce:${userId}`);
```

---

### 6. Temporary Audio File Cleanup Failures

**Severity:** HIGH
**CWE:** CWE-459 (Incomplete Cleanup)

**Affected File:** `/lib/lectures/pipeline.ts` (Lines 199-220)

**Vulnerability:**
Temp files are only cleaned on successful processing:

```typescript
} catch (error) {
  await updateLectureStatus(lectureId, { status: 'failed', ... });
  // NO cleanup of temp audio file!
}
```

**Impact:**
- Disk exhaustion from orphaned files
- Sensitive audio persists indefinitely
- Privacy violation

**Remediation:**
```typescript
} catch (error) {
  try { await cleanupTempAudio(lectureId); } catch {}
  await updateLectureStatus(lectureId, { status: 'failed', ... });
}
```

---

### 7. Path Traversal Risk in Audio Endpoint

**Severity:** HIGH
**CWE:** CWE-22 (Path Traversal)

**Affected File:** `/app/api/lectures/audio/[lectureId]/route.ts` (Line 29)

**Vulnerability:**
`lectureId` parameter is not validated as UUID format:

```typescript
const { lectureId } = await params;
const filePath = getTempAudioPath(lectureId);  // No UUID validation
```

**Attack Vector:**
```
GET /api/lectures/audio/../../../etc/passwd
```

**Remediation:**
```typescript
import { validate as uuidValidate } from 'uuid';

if (!uuidValidate(lectureId)) {
  return Response.json({ error: 'Invalid lecture ID' }, { status: 400 });
}
```

---

### 8. Missing Security Headers

**Severity:** HIGH
**CWE:** CWE-693 (Protection Mechanism Failure)

**Affected File:** `/proxy.ts`, `/next.config.ts`

**Missing Headers:**
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`

**Remediation:**
Add to `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ],
  }];
}
```

---

## Medium Severity Issues

### 9. Environment Variable Exposure in Error Messages

**File:** `/app/api/openrouter/connect/route.ts` (Lines 13-16)

Reveals configuration state in error responses:
```typescript
{ error: 'Server configuration error: NEXT_PUBLIC_APP_URL not set' }
```

**Fix:** Use generic error messages.

---

### 10. PKCE Token Logging

**File:** `/app/api/openrouter/connect/route.ts` (Lines 25-30)

Partial PKCE tokens logged to console. Remove in production.

---

### 11. PDF Bomb/Large File Validation

**File:** `/app/api/documents/route.ts`

No page count limit on uploaded PDFs. Add:
```typescript
const MAX_PAGES = 500;
if (pdfDoc.getPageCount() > MAX_PAGES) throw new Error('Too many pages');
```

---

### 12. MIME Type Validation Before Storage

**File:** `/app/api/documents/route.ts` (Lines 52-58, 117)

PDF validated AFTER initial storage. Validate magic bytes BEFORE:
```typescript
const MAGIC_PDF = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
if (!Buffer.from(pdfBytes.slice(0, 4)).equals(MAGIC_PDF)) {
  return Response.json({ error: 'Invalid PDF' }, { status: 400 });
}
```

---

### 13. Plaintext File Storage

**Files:** `/lib/storage/documents.ts`, `/lib/lectures/temp-files.ts`

Files written without encryption at rest. Consider encrypting sensitive uploads.

---

### 14. Race Condition in Duplicate Detection

**File:** `/app/api/documents/route.ts` (Lines 75-123)

TOCTOU race allows duplicate uploads. Use `INSERT ... ON CONFLICT`.

---

### 15. API Key Slice as Hash

**File:** `/app/api/openrouter/callback/route.ts` (Line 101)

```typescript
const keyHash = key.slice(0, 32);  // Not a real hash
```

Use proper cryptographic hash if key identification is needed.

---

### 16. Debug Logging of Document Content

**File:** `/lib/documents/page-processor.ts` (Lines 64-68)

If `DOCUMENT_DEBUG_LOG` is set, extracted content is logged. Ensure disabled in production.

---

## Secure Implementations (Strengths)

The following security patterns are correctly implemented:

| Area | Implementation | Location |
|------|----------------|----------|
| Authentication | Clerk middleware with `auth.protect()` | `/proxy.ts` |
| API Key Encryption | AES-256-GCM with random IV and auth tag | `/lib/crypto/encryption.ts` |
| Document Ownership | userId verification before access | `/api/documents/[id]/route.ts` |
| Session Ownership | userId + sessionId verification | `/api/sessions/[id]/route.ts` |
| Cron Protection | Bearer token with CRON_SECRET | `/api/cron/sync-courses/route.ts` |
| OAuth Security | PKCE with SHA256 code challenge | `/api/openrouter/connect/route.ts` |
| File Type Validation | PDF MIME type check | `/api/documents/route.ts` |
| Command Injection | spawn() with array args (not shell) | `/lib/lectures/ffmpeg.ts` |
| XSS Prevention | Streamdown library for markdown | `/components/Chat/MarkdownMessage.tsx` |
| SQL Injection | Drizzle ORM parameterized queries | Most database operations |

---

## Remediation Priority

### Immediate (This Week)
1. Fix SQL injection in vector literals
2. Add URL validation for SSRF prevention
3. Add authentication to audio endpoint

### Short-Term (2 Weeks)
4. Add course enrollment verification
5. Implement security headers
6. Fix temp file cleanup in error handlers
7. Add UUID validation to audio endpoint

### Medium-Term (1 Month)
8. Move PKCE store to Redis/database
9. Add encryption at rest for uploads
10. Implement rate limiting
11. Add audit logging

---

## Appendix: File Reference

### Critical Files Requiring Immediate Review

| File | Lines | Issue |
|------|-------|-------|
| `/lib/ai/retrieval.ts` | 128, 151, 156, 185, 210, 214 | SQL Injection |
| `/lib/documents/chunk-ingestion.ts` | 89, 94 | SQL Injection |
| `/lib/lectures/pipeline.ts` | 131, 136 | SQL Injection |
| `/app/api/lectures/stream/route.ts` | 50-90 | SSRF |
| `/lib/lectures/ffmpeg.ts` | 209-214, 225-226 | SSRF |
| `/app/api/lectures/audio/[lectureId]/route.ts` | 1-47 | Unauthenticated Access |
| `/proxy.ts` | 8 | Public Route Config |

### Secure Implementation References

| File | Purpose |
|------|---------|
| `/lib/crypto/encryption.ts` | API key encryption (exemplary) |
| `/app/api/documents/[id]/route.ts` | Ownership verification pattern |
| `/proxy.ts` | Clerk middleware configuration |
