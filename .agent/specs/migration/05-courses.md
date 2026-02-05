# Phase 5: Courses Migration

**Status:** Planned
**Depends on:** Phase 4 (Lecture Pipeline)

## Overview

Create `courses` and `userCourses` tables in the Next.js database (`studybuddy-dev`). This enables the Next.js app to manage courses directly without calling the Python backend.

**Key Decision: No `users` table.** Clerk handles all user data. We use Clerk IDs directly as TEXT, consistent with all other Next.js tables (`userApiKeys`, `chatSessions`, `userLectures`, etc.).

## Current State

### Legacy Database (`studybuddy-prod` - Python)

```sql
-- Legacy tables we're NOT migrating:
CREATE TABLE users (id UUID, created_at TIMESTAMPTZ);  -- NOT NEEDED
CREATE TABLE user_courses (user_id UUID, course_id UUID);  -- Uses UUID

-- This table structure we ARE replicating:
CREATE TABLE courses (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  instructor TEXT,
  is_official BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Next.js Database (`studybuddy-dev`)

All tables use **TEXT for user IDs** (Clerk IDs directly):
- `ai.user_api_keys` → `userId TEXT`
- `ai.chat_sessions` → `userId TEXT`
- `ai.user_lectures` → `userId TEXT`
- `ai.documents` → `userId TEXT`

**We follow this pattern.** No UUID conversion needed.

## Schema Design

```typescript
// lib/db/schema.ts - add to ai schema

export const courses = aiSchema.table('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  instructor: text('instructor'),
  isOfficial: boolean('is_official').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_courses_code').on(table.code),
]);

export const userCourses = aiSchema.table('user_courses', {
  userId: text('user_id').notNull(),  // Clerk ID directly - no users table!
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.courseId] }),
  index('idx_user_courses_user_id').on(table.userId),
  index('idx_user_courses_course_id').on(table.courseId),
]);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type UserCourse = typeof userCourses.$inferSelect;
export type NewUserCourse = typeof userCourses.$inferInsert;
```

## Course Sync Service

The `CourseSyncService` scrapes courses from CDCS (University of Rochester Course Catalog):

- **Endpoint:** `https://cdcs.ur.rochester.edu/XMLQuery.aspx?id=XML&term={term}&type=Lecture`
- **Terms:** Fall 2025, Spring 2025 (configurable)
- **Features:**
  - XML parsing for course code, title, instructor
  - Section deduplication (ACC 201-1, ACC 201-2 → ACC 201)
  - Multi-instructor merging (semicolon-separated)
  - Stale course deletion with 80% safety threshold
- **Trigger:** Scheduled cron job (monthly)

## Course Sync (Cron Job)

Course sync runs as a **scheduled cron job**, not a user-triggered endpoint.

```typescript
// app/api/cron/sync-courses/route.ts
// Protected by CRON_SECRET header (Vercel Cron pattern)

export async function GET(req: Request) {
  // Verify cron secret
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await syncCourses(['Fall 2025', 'Spring 2025']);
  return Response.json(result);
}
```

Configure in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-courses",
      "schedule": "0 6 1 * *"  // Monthly on the 1st at 6am UTC
    }
  ]
}
```

## API Routes

### List All Courses

```
GET /api/courses
Authorization: Bearer <clerk_token>

Response 200:
{
  "courses": [
    { "id": "uuid", "code": "CSC 171", "title": "Intro to CS", "instructor": "John Doe", "isOfficial": true }
  ]
}
```

### List User's Courses

```
GET /api/user/courses
Authorization: Bearer <clerk_token>

Response 200:
{
  "courses": [...]
}
```

### Add Course to User

```
POST /api/user/courses/:courseId
Authorization: Bearer <clerk_token>

Response 200: { "message": "Course added" }
Response 409: { "error": "Course already added" }
```

### Remove Course from User

```
DELETE /api/user/courses/:courseId
Authorization: Bearer <clerk_token>

Response 204: (no content)
```

## Implementation Tasks

### Task 1: Schema & Migration
- [ ] 1.1 Add `courses` table to `lib/db/schema.ts` (in `ai` schema)
- [ ] 1.2 Add `userCourses` table to `lib/db/schema.ts`
- [ ] 1.3 Run `drizzle-kit generate` to create migration
- [ ] 1.4 Run `drizzle-kit migrate` to apply migration
- [ ] 1.5 Export types from `lib/db/index.ts`

### Task 2: Course Sync Service
- [ ] 2.1 Create `lib/courses/sync-service.ts`
- [ ] 2.2 Implement `fetchCoursesFromCdcs(term)` - fetch and parse XML
- [ ] 2.3 Implement `syncCourses(terms, dryRun)` - upsert logic
- [ ] 2.4 Implement section deduplication (strip `-1`, `-01`, `-FA.MB` suffixes)
- [ ] 2.5 Implement instructor merging across sections
- [ ] 2.6 Implement stale course deletion with safety threshold
- [ ] 2.7 Write unit tests with mocked XML responses

### Task 3: API Routes
- [ ] 3.1 Create `app/api/cron/sync-courses/route.ts` (cron job, protected by CRON_SECRET)
- [ ] 3.2 Create `app/api/courses/route.ts` (GET list all)
- [ ] 3.3 Create `app/api/user/courses/route.ts` (GET user's courses)
- [ ] 3.4 Create `app/api/user/courses/[courseId]/route.ts` (POST add, DELETE remove)
- [ ] 3.5 Add Clerk auth to user routes
- [ ] 3.6 Configure cron schedule in `vercel.json`

### Task 4: Frontend Integration
- [ ] 4.1 Update `lib/api.ts` to use local routes instead of Python backend
- [ ] 4.2 Verify `useCourses` hook works with new endpoints
- [ ] 4.3 Test course add/remove flow

### Task 5: Cleanup
- [ ] 5.1 Remove Python course endpoints from usage
- [ ] 5.2 Update `.env.example` with `CRON_SECRET`
- [ ] 5.3 Update CLAUDE.md if needed

## Environment Variables

```bash
# Secret for cron job authentication (Vercel sets this automatically)
CRON_SECRET=xxx
```

## Testing Strategy

### Unit Tests
- Course sync XML parsing
- Section deduplication regex
- Instructor merging logic

### Integration Tests
- API route authentication
- Course CRUD operations
- User-course associations

### E2E Tests
- Course list loads in UI
- Add/remove course flow
- Empty state when no courses

## Dependencies

- No new dependencies needed
- XML parsing via built-in `DOMParser` or `fast-xml-parser`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CDCS endpoint changes format | Cache last successful sync, alert on parse failures |
| Cron job fails silently | Add logging/alerting for sync failures |

## Success Criteria

1. Next.js can list/add/remove courses without Python backend
2. Course sync works via cron job
3. All course-related E2E tests pass
4. No Python backend calls for course operations

## Related Specs

- [00-overview.md](./00-overview.md) - Migration overview
- [04-lecture-pipeline.md](./04-lecture-pipeline.md) - Uses courseId from courses table
