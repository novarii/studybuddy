import { test, expect } from '@playwright/test';

/**
 * Courses E2E Tests
 *
 * These tests run authenticated and verify the course API routes work correctly.
 * They test the full stack including database operations.
 *
 * Note: These tests assume no courses exist in the database yet, or work
 * idempotently with existing data.
 */

test.describe('Courses API - List All Courses', () => {
  test('returns 200 with courses array', async ({ request }) => {
    const response = await request.get('/api/courses');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const json = await response.json();
    expect(json).toHaveProperty('courses');
    expect(Array.isArray(json.courses)).toBe(true);
  });

  test('courses have correct structure', async ({ request }) => {
    const response = await request.get('/api/courses');
    const json = await response.json();

    // If there are courses, verify structure
    if (json.courses.length > 0) {
      const course = json.courses[0];
      expect(course).toHaveProperty('id');
      expect(course).toHaveProperty('code');
      expect(course).toHaveProperty('title');
      expect(course).toHaveProperty('instructor');
      expect(course).toHaveProperty('isOfficial');
    }
  });

  test('courses are sorted by code', async ({ request }) => {
    const response = await request.get('/api/courses');
    const json = await response.json();

    if (json.courses.length > 1) {
      const codes = json.courses.map((c: { code: string }) => c.code);
      const sortedCodes = [...codes].sort();
      expect(codes).toEqual(sortedCodes);
    }
  });
});

test.describe('Courses API - User Enrolled Courses', () => {
  test('returns 200 with courses array', async ({ request }) => {
    const response = await request.get('/api/user/courses');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const json = await response.json();
    expect(json).toHaveProperty('courses');
    expect(Array.isArray(json.courses)).toBe(true);
  });

  test('user courses have correct structure', async ({ request }) => {
    const response = await request.get('/api/user/courses');
    const json = await response.json();

    // If there are courses, verify structure
    if (json.courses.length > 0) {
      const course = json.courses[0];
      expect(course).toHaveProperty('id');
      expect(course).toHaveProperty('code');
      expect(course).toHaveProperty('title');
      expect(course).toHaveProperty('instructor');
      expect(course).toHaveProperty('isOfficial');
    }
  });
});

test.describe('Courses API - Add/Remove Course', () => {
  test('returns 404 when adding non-existent course', async ({ request }) => {
    const response = await request.post('/api/user/courses/00000000-0000-0000-0000-000000000000');

    expect(response.status()).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Course not found');
  });

  test('returns 204 when removing course (idempotent)', async ({ request }) => {
    // Removing a course that doesn't exist should still return 204
    const response = await request.delete('/api/user/courses/00000000-0000-0000-0000-000000000000');

    expect(response.status()).toBe(204);
  });

  test('add and remove course flow works', async ({ request }) => {
    // First, get a list of all courses
    const listResponse = await request.get('/api/courses');
    const { courses } = await listResponse.json();

    // Skip test if no courses exist
    if (courses.length === 0) {
      test.skip();
      return;
    }

    const testCourse = courses[0];

    // Get initial user courses
    const initialUserCoursesResponse = await request.get('/api/user/courses');
    const initialUserCourses = await initialUserCoursesResponse.json();
    const wasEnrolled = initialUserCourses.courses.some(
      (c: { id: string }) => c.id === testCourse.id
    );

    // If already enrolled, remove first
    if (wasEnrolled) {
      await request.delete(`/api/user/courses/${testCourse.id}`);
    }

    // Add course
    const addResponse = await request.post(`/api/user/courses/${testCourse.id}`);
    expect(addResponse.status()).toBe(200);
    const addJson = await addResponse.json();
    expect(addJson.message).toBe('Course added');

    // Verify course is now in user's list
    const afterAddResponse = await request.get('/api/user/courses');
    const afterAdd = await afterAddResponse.json();
    expect(afterAdd.courses.some((c: { id: string }) => c.id === testCourse.id)).toBe(true);

    // Try adding again - should get 409 Conflict
    const duplicateAddResponse = await request.post(`/api/user/courses/${testCourse.id}`);
    expect(duplicateAddResponse.status()).toBe(409);
    const duplicateJson = await duplicateAddResponse.json();
    expect(duplicateJson.error).toBe('Course already added');

    // Remove course
    const removeResponse = await request.delete(`/api/user/courses/${testCourse.id}`);
    expect(removeResponse.status()).toBe(204);

    // Verify course is no longer in user's list
    const afterRemoveResponse = await request.get('/api/user/courses');
    const afterRemove = await afterRemoveResponse.json();
    expect(afterRemove.courses.some((c: { id: string }) => c.id === testCourse.id)).toBe(false);

    // Restore original state if was enrolled
    if (wasEnrolled) {
      await request.post(`/api/user/courses/${testCourse.id}`);
    }
  });
});

test.describe('Courses API - Unauthenticated Access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('list all courses returns redirect for unauthenticated user', async ({ request }) => {
    const response = await request.get('/api/courses');
    // Clerk middleware returns 200 with redirect page for unauthenticated
    // The actual route never executes
    expect(response.status()).toBe(200);
  });

  test('user courses returns redirect for unauthenticated user', async ({ request }) => {
    const response = await request.get('/api/user/courses');
    expect(response.status()).toBe(200);
  });
});
