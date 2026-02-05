# Task: Complete Python Backend Migration

**Status:** In Progress
**Created:** 2026-02-05

## Summary

Migrate remaining API calls from Python backend (`API_BASE` / `localhost:8000`) to local Next.js API routes.

## Completed ✅

- `documents.listByCourse` → `/api/documents?courseId=...`
- `documents.delete` → `/api/documents/{id}` (DELETE)
- `documents.upload` → `/api/documents` (POST)
- `lectures.listByCourse` → `/api/lectures?courseId=...`
- `courses.*` (all methods)
- `sessions.*` (all methods)

## Remaining Work

### 1. Remove Dead Code in `lib/api.ts`
- [ ] Remove `documents.get` - unused method, still uses `fetchWithAuth`
- [ ] Remove `lectures.get` - unused method, still uses `fetchWithAuth`

### 2. Fix SlidesSection PDF URL
**File:** `components/RightPanel/SlidesSection.tsx`

Current (broken):
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const pdfUrl = documentId ? `${API_BASE}/documents/${documentId}/file#page=${pageNumber}` : null;
```

Should be:
```typescript
const pdfUrl = documentId ? `/api/documents/${documentId}/file#page=${pageNumber}` : null;
```

### 3. Clean Up Configuration
- [ ] Update `.env.example` to remove Python backend default
- [ ] Consider removing `API_BASE` constant from `lib/api.ts` once all calls migrated
- [ ] Remove `fetchWithAuth` function if no longer used

## Local API Routes Available

| Endpoint | Method | Route File |
|----------|--------|------------|
| `/api/documents` | GET, POST | `app/api/documents/route.ts` |
| `/api/documents/[id]` | GET, DELETE | `app/api/documents/[id]/route.ts` |
| `/api/documents/[id]/file` | GET | `app/api/documents/[id]/file/route.ts` |
| `/api/lectures` | GET | `app/api/lectures/route.ts` |
| `/api/courses` | GET | `app/api/courses/route.ts` |
| `/api/sessions` | GET, POST | `app/api/sessions/route.ts` |
| `/api/chat` | POST | `app/api/chat/route.ts` |
