# Phase 5 Tasks: Courses Migration

**Spec Reference:** [05-courses.md](../specs/migration/05-courses.md)
**Depends on:** Phase 4 (Lecture Pipeline) completion

**Key Decision: No `users` table needed.** We use Clerk IDs directly as TEXT, consistent with all other Next.js tables.

## Task Overview

| Task | Description | Dependencies | Effort |
|------|-------------|--------------|--------|
| 1 | Schema & Migration | None | Small |
| 2 | Course Sync Service | Task 1 | Medium |
| 3 | API Routes | Tasks 1, 2 | Medium |
| 4 | Frontend Integration | Task 3 | Small |
| 5 | Cleanup | Task 4 | Small |

---

## Task 1: Schema & Migration

**Goal:** Add courses tables to Drizzle schema and create migration.

### Subtasks
- [x] 1.1 Add `courses` table to `lib/db/schema.ts` (in `ai` schema)
- [x] 1.2 Add `userCourses` table to `lib/db/schema.ts` (uses TEXT userId - Clerk ID)
- [x] 1.3 Run `drizzle-kit generate` to create migration
- [x] 1.4 Run `drizzle-kit migrate` to apply migration
- [x] 1.5 Export types from `lib/db/index.ts`

### Schema
```typescript
export const courses = aiSchema.table('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  instructor: text('instructor'),
  isOfficial: boolean('is_official').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userCourses = aiSchema.table('user_courses', {
  userId: text('user_id').notNull(),  // Clerk ID directly!
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.courseId] }),
]);
```

### Deliverables
- Updated `lib/db/schema.ts`
- Migration in `drizzle/migrations/`

---

## Task 2: Course Sync Service

**Goal:** Port CDCS scraper from Python to TypeScript.

### Subtasks
- [x] 2.1 Create `lib/courses/sync-service.ts`
- [x] 2.2 Implement `fetchCoursesFromCdcs(term: string)` - fetch XML from CDCS
- [x] 2.3 Implement XML parsing (course code, title, instructor)
- [x] 2.4 Implement section deduplication regex (`-1`, `-01`, `-FA.MB` → stripped)
- [x] 2.5 Implement instructor merging across sections
- [x] 2.6 Implement `syncCourses(terms, options)` - full upsert logic
- [x] 2.7 Implement stale course deletion with 80% safety threshold
- [x] 2.8 Write unit tests with mocked XML responses

### CDCS Endpoint
```
https://cdcs.ur.rochester.edu/XMLQuery.aspx?id=XML&term={term}&type=Lecture
```

### Deliverables
- `lib/courses/sync-service.ts`
- `lib/courses/types.ts`
- `__tests__/lib/courses/sync-service.test.ts`

---

## Task 3: API Routes

**Goal:** Create Next.js API routes for course operations.

### Subtasks
- [ ] 3.1 Create `app/api/cron/sync-courses/route.ts` (cron job, protected by CRON_SECRET)
- [ ] 3.2 Create `app/api/courses/route.ts` (GET - list all courses)
- [ ] 3.3 Create `app/api/user/courses/route.ts` (GET - user's enrolled courses)
- [ ] 3.4 Create `app/api/user/courses/[courseId]/route.ts` (POST add, DELETE remove)
- [ ] 3.5 Add Clerk auth to user routes
- [ ] 3.6 Configure cron schedule in `vercel.json`
- [ ] 3.7 Write API route tests

### Deliverables
- `app/api/cron/sync-courses/route.ts`
- `app/api/courses/route.ts`
- `app/api/user/courses/route.ts`
- `app/api/user/courses/[courseId]/route.ts`
- `vercel.json` with cron config
- `__tests__/api/courses/*.test.ts`

---

## Task 4: Frontend Integration

**Goal:** Update frontend to use local API routes.

### Subtasks
- [ ] 4.1 Update `lib/api.ts` - change `api.courses.*` to use `/api/courses/*`
- [ ] 4.2 Verify `useCourses` hook works with new endpoints
- [ ] 4.3 Test course add/remove in UI
- [ ] 4.4 Write E2E tests for course operations

### Deliverables
- Updated `lib/api.ts`
- `e2e/tests/courses.spec.ts`

---

## Task 5: Cleanup

**Goal:** Remove Python backend dependency for courses.

### Subtasks
- [ ] 5.1 Verify all course operations work without Python backend
- [ ] 5.2 Update `.env.example` with `CRON_SECRET`
- [ ] 5.3 Update CLAUDE.md if needed

### Deliverables
- Updated documentation
- Verified independence from Python backend

---

## Execution Order

```
Task 1 (Schema & Migration)
    ↓
Task 2 (Course Sync Service)
    ↓
Task 3 (API Routes)
    ↓
Task 4 (Frontend Integration)
    ↓
Task 5 (Cleanup)
```

All tasks are sequential - each depends on the previous.

---

## Definition of Done

Phase 5 is complete when:
- [ ] All 5 tasks marked complete
- [ ] Courses list/add/remove works without Python backend
- [ ] Course sync works via cron job
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] `NEXT_PUBLIC_API_URL` no longer needed for course operations

---

## Notes

- **No `users` table** - we use Clerk IDs directly as TEXT
- Tables go in `ai` schema (like all other Next.js tables)
- CDCS endpoint may have rate limits - be gentle during testing
- Course sync runs as a cron job (weekly), not user-triggered
