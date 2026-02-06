import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing modules
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');

// Sample XML responses for testing
const SAMPLE_XML_SINGLE_COURSE = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course>
    <cn>CSC 171</cn>
    <title>The Science of Programming</title>
    <instructors>George Ferguson</instructors>
  </course>
</root>`;

const SAMPLE_XML_MULTIPLE_COURSES = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course>
    <cn>CSC 171-1</cn>
    <title>The Science of Programming</title>
    <instructors>George Ferguson</instructors>
  </course>
  <course>
    <cn>CSC 171-2</cn>
    <title>The Science of Programming</title>
    <instructors>Jane Smith</instructors>
  </course>
  <course>
    <cn>ACC 201</cn>
    <title>Financial Accounting</title>
    <instructors>John Doe; Mary Johnson</instructors>
  </course>
</root>`;

const SAMPLE_XML_WITH_SECTIONS = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course>
    <cn>ACC 201-1</cn>
    <title>Financial Accounting</title>
    <instructors>John Doe</instructors>
  </course>
  <course>
    <cn>ACC 201-01</cn>
    <title>Financial Accounting</title>
    <instructors>Jane Smith</instructors>
  </course>
  <course>
    <cn>ACC 401-FA.MB</cn>
    <title>Advanced Accounting</title>
    <instructors>Bob Wilson</instructors>
  </course>
  <course>
    <cn>ACC 501-SP.PH</cn>
    <title>Graduate Accounting</title>
    <instructors>Alice Brown</instructors>
  </course>
</root>`;

const SAMPLE_XML_EMPTY = `<?xml version="1.0" encoding="utf-8"?>
<root>
</root>`;

const SAMPLE_XML_MISSING_FIELDS = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course>
    <cn>CSC 171</cn>
    <title>The Science of Programming</title>
  </course>
  <course>
    <title>No Code Course</title>
    <instructors>Some Instructor</instructors>
  </course>
  <course>
    <cn>CSC 172</cn>
    <instructors>No Title Instructor</instructors>
  </course>
</root>`;

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock database
const mockFrom = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockWhere = vi.fn();

vi.mock('@/lib/db', () => {
  return {
    db: {
      select: () => ({ from: mockFrom }),
      insert: () => ({ values: mockValues }),
      delete: () => ({ where: mockWhere }),
    },
    courses: {
      id: 'courses.id',
      code: 'courses.code',
      title: 'courses.title',
      instructor: 'courses.instructor',
      isOfficial: 'courses.is_official',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  inArray: vi.fn((col, vals) => ({ type: 'inArray', col, vals })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
}));

// Import the module under test after mocks
import {
  stripSectionSuffix,
  parseXmlCourses,
  mergeInstructors,
  fetchCoursesFromCdcs,
  syncCourses,
} from '@/lib/courses/sync-service';
import {
  CDCS_BASE_URL,
  DEFAULT_TERMS,
  DELETION_SAFETY_THRESHOLD,
} from '@/lib/courses/types';

describe('Course Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFrom.mockReset();
    mockValues.mockReset();
    mockWhere.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('stripSectionSuffix', () => {
    it('should strip simple numeric section suffix like -1', () => {
      expect(stripSectionSuffix('CSC 171-1')).toBe('CSC 171');
      expect(stripSectionSuffix('ACC 201-2')).toBe('ACC 201');
    });

    it('should strip padded numeric section suffix like -01', () => {
      expect(stripSectionSuffix('CSC 171-01')).toBe('CSC 171');
      expect(stripSectionSuffix('ACC 201-02')).toBe('ACC 201');
    });

    it('should strip program section suffix like -FA.MB', () => {
      expect(stripSectionSuffix('ACC 401-FA.MB')).toBe('ACC 401');
      expect(stripSectionSuffix('ACC 501-SP.PH')).toBe('ACC 501');
    });

    it('should strip various alphanumeric suffixes', () => {
      expect(stripSectionSuffix('CSC 171-A')).toBe('CSC 171');
      expect(stripSectionSuffix('CSC 171-AB')).toBe('CSC 171');
      expect(stripSectionSuffix('CSC 171-A1')).toBe('CSC 171');
    });

    it('should not modify code without section suffix', () => {
      expect(stripSectionSuffix('CSC 171')).toBe('CSC 171');
      expect(stripSectionSuffix('ACC 201')).toBe('ACC 201');
    });

    it('should handle edge cases', () => {
      expect(stripSectionSuffix('')).toBe('');
      expect(stripSectionSuffix('CSC')).toBe('CSC');
    });

    it('should preserve spaces and course structure', () => {
      expect(stripSectionSuffix('CSC  171-1')).toBe('CSC  171');
      expect(stripSectionSuffix('CHEM 231-01')).toBe('CHEM 231');
    });
  });

  describe('parseXmlCourses', () => {
    it('should parse single course correctly', () => {
      const courses = parseXmlCourses(SAMPLE_XML_SINGLE_COURSE);

      expect(courses).toHaveLength(1);
      expect(courses[0]).toEqual({
        code: 'CSC 171',
        title: 'The Science of Programming',
        instructor: 'George Ferguson',
      });
    });

    it('should parse multiple courses correctly', () => {
      const courses = parseXmlCourses(SAMPLE_XML_MULTIPLE_COURSES);

      expect(courses).toHaveLength(3);
      // Note: section suffixes are stripped
      expect(courses[0].code).toBe('CSC 171');
      expect(courses[1].code).toBe('CSC 171');
      expect(courses[2].code).toBe('ACC 201');
    });

    it('should strip section suffixes during parsing', () => {
      const courses = parseXmlCourses(SAMPLE_XML_WITH_SECTIONS);

      expect(courses).toHaveLength(4);
      expect(courses[0].code).toBe('ACC 201'); // from ACC 201-1
      expect(courses[1].code).toBe('ACC 201'); // from ACC 201-01
      expect(courses[2].code).toBe('ACC 401'); // from ACC 401-FA.MB
      expect(courses[3].code).toBe('ACC 501'); // from ACC 501-SP.PH
    });

    it('should handle empty XML response', () => {
      const courses = parseXmlCourses(SAMPLE_XML_EMPTY);

      expect(courses).toHaveLength(0);
    });

    it('should skip courses with missing code', () => {
      const courses = parseXmlCourses(SAMPLE_XML_MISSING_FIELDS);

      // Should only include CSC 171 (has code and title)
      // Skip "No Code Course" (missing cn)
      // Skip CSC 172 (missing title)
      expect(courses).toHaveLength(1);
      expect(courses[0].code).toBe('CSC 171');
    });

    it('should handle null instructor', () => {
      const courses = parseXmlCourses(SAMPLE_XML_MISSING_FIELDS);

      expect(courses[0].instructor).toBeNull();
    });

    it('should trim whitespace from fields', () => {
      const xmlWithWhitespace = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course>
    <cn>  CSC 171  </cn>
    <title>  The Science of Programming  </title>
    <instructors>  George Ferguson  </instructors>
  </course>
</root>`;

      const courses = parseXmlCourses(xmlWithWhitespace);

      expect(courses[0].code).toBe('CSC 171');
      expect(courses[0].title).toBe('The Science of Programming');
      expect(courses[0].instructor).toBe('George Ferguson');
    });

    it('should throw on invalid XML', () => {
      expect(() => parseXmlCourses('not valid xml')).toThrow();
    });
  });

  describe('mergeInstructors', () => {
    it('should merge unique instructors from single string', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, 'John Doe; Jane Smith');

      expect(instructors.size).toBe(2);
      expect(instructors.has('John Doe')).toBe(true);
      expect(instructors.has('Jane Smith')).toBe(true);
    });

    it('should handle single instructor', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, 'John Doe');

      expect(instructors.size).toBe(1);
      expect(instructors.has('John Doe')).toBe(true);
    });

    it('should deduplicate instructors across calls', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, 'John Doe');
      mergeInstructors(instructors, 'John Doe; Jane Smith');
      mergeInstructors(instructors, 'Jane Smith');

      expect(instructors.size).toBe(2);
    });

    it('should handle null instructor', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, null);

      expect(instructors.size).toBe(0);
    });

    it('should handle empty string', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, '');

      expect(instructors.size).toBe(0);
    });

    it('should trim whitespace from names', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, '  John Doe  ;   Jane Smith  ');

      expect(instructors.has('John Doe')).toBe(true);
      expect(instructors.has('Jane Smith')).toBe(true);
    });

    it('should skip empty names after split', () => {
      const instructors = new Set<string>();
      mergeInstructors(instructors, 'John Doe;;Jane Smith;');

      expect(instructors.size).toBe(2);
    });
  });

  describe('fetchCoursesFromCdcs', () => {
    it('should fetch and parse courses from CDCS endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const courses = await fetchCoursesFromCdcs('Fall 2025');

      expect(courses).toHaveLength(1);
      expect(courses[0].code).toBe('CSC 171');
    });

    it('should construct correct URL with term and type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      await fetchCoursesFromCdcs('Fall 2025', 'Lecture');

      expect(mockFetch).toHaveBeenCalledWith(
        `${CDCS_BASE_URL}?id=XML&term=${encodeURIComponent('Fall 2025')}&type=Lecture`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should URL encode term parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      await fetchCoursesFromCdcs('Spring 2025');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('term=Spring%202025'),
        expect.anything()
      );
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchCoursesFromCdcs('Fall 2025')).rejects.toThrow(
        'CDCS fetch failed: 500 Internal Server Error'
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchCoursesFromCdcs('Fall 2025')).rejects.toThrow(
        'Network error'
      );
    });

    it('should default to Lecture course type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      await fetchCoursesFromCdcs('Fall 2025');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=Lecture'),
        expect.anything()
      );
    });
  });

  describe('syncCourses', () => {
    const mockExistingCourses = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'CSC 171',
        title: 'Old Title',
        instructor: 'Old Instructor',
        isOfficial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        code: 'CSC 172',
        title: 'Data Structures',
        instructor: 'Some Prof',
        isOfficial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    beforeEach(() => {
      // Default: return empty existing courses
      mockFrom.mockResolvedValue([]);
      mockValues.mockReturnValue({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      });
      mockOnConflictDoUpdate.mockResolvedValue(undefined);
      mockWhere.mockResolvedValue(undefined);
    });

    it('should use default terms when none provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      const result = await syncCourses();

      expect(result.terms).toEqual(DEFAULT_TERMS);
      expect(mockFetch).toHaveBeenCalledTimes(DEFAULT_TERMS.length);
    });

    it('should fetch courses from all specified terms', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      const terms = ['Fall 2025', 'Spring 2025', 'Summer 2025'];
      await syncCourses({ terms });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should count created courses correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.created).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should count updated courses correctly', async () => {
      // Existing course with different title
      mockFrom.mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          code: 'CSC 171',
          title: 'Old Title',
          instructor: 'Old Instructor',
          isOfficial: false, // Will be updated to true
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('should count unchanged courses correctly', async () => {
      // Existing course with same values
      mockFrom.mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          code: 'CSC 171',
          title: 'The Science of Programming',
          instructor: 'George Ferguson',
          isOfficial: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.unchanged).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should deduplicate courses across sections', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_MULTIPLE_COURSES,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      // CSC 171-1 and CSC 171-2 should merge into one CSC 171
      // ACC 201 is another course
      expect(result.total).toBe(2);
    });

    it('should merge instructors across sections', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_MULTIPLE_COURSES,
      });

      // Capture what gets inserted
      let insertedCourses: Array<{ code: string; instructor: string }> = [];
      mockValues.mockImplementation((courses) => {
        insertedCourses = courses;
        return { onConflictDoUpdate: mockOnConflictDoUpdate };
      });

      await syncCourses({ terms: ['Fall 2025'] });

      const csc171 = insertedCourses.find((c) => c.code === 'CSC 171');
      expect(csc171).toBeDefined();
      // Should merge George Ferguson and Jane Smith
      expect(csc171?.instructor).toContain('George Ferguson');
      expect(csc171?.instructor).toContain('Jane Smith');
    });

    it('should delete stale official courses when above safety threshold', async () => {
      // Set up existing courses
      mockFrom.mockResolvedValue(mockExistingCourses);

      // Only return CSC 171 from CDCS (CSC 172 is stale)
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      // Safety check: 1 scraped course / 2 existing = 50% < 80% threshold
      // Deletion should be skipped
      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.deletionSkipped).toBe(true);
      expect(result.deleted).toBe(0);
    });

    it('should skip deletion when below safety threshold', async () => {
      // 10 existing courses
      const manyExistingCourses = Array.from({ length: 10 }, (_, i) => ({
        id: `550e8400-e29b-41d4-a716-44665544000${i}`,
        code: `CSC ${170 + i}`,
        title: `Course ${i}`,
        instructor: `Instructor ${i}`,
        isOfficial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockFrom.mockResolvedValue(manyExistingCourses);

      // Only 1 course from CDCS - way below 80% threshold
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.deletionSkipped).toBe(true);
      expect(result.deleted).toBe(0);
    });

    it('should delete stale courses when above safety threshold', async () => {
      // 5 existing courses, 4 from CDCS = 80% threshold met
      const existingCourses = [
        { id: '1', code: 'CSC 171', title: 'T1', instructor: 'I1', isOfficial: true },
        { id: '2', code: 'CSC 172', title: 'T2', instructor: 'I2', isOfficial: true },
        { id: '3', code: 'CSC 173', title: 'T3', instructor: 'I3', isOfficial: true },
        { id: '4', code: 'CSC 174', title: 'T4', instructor: 'I4', isOfficial: true },
        { id: '5', code: 'STALE 999', title: 'Stale', instructor: 'Old', isOfficial: true },
      ];

      mockFrom.mockResolvedValue(existingCourses);

      // Return 4 courses (CSC 171-174) - 80% of existing
      const fourCoursesXml = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <course><cn>CSC 171</cn><title>T1</title><instructors>I1</instructors></course>
  <course><cn>CSC 172</cn><title>T2</title><instructors>I2</instructors></course>
  <course><cn>CSC 173</cn><title>T3</title><instructors>I3</instructors></course>
  <course><cn>CSC 174</cn><title>T4</title><instructors>I4</instructors></course>
</root>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => fourCoursesXml,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      // 4 scraped / 5 existing = 80%, threshold met
      expect(result.deletionSkipped).toBe(false);
      expect(result.deleted).toBe(1);
    });

    it('should not delete non-official courses', async () => {
      // Non-official course should not be deleted
      const existingCourses = [
        { id: '1', code: 'CSC 171', title: 'T1', instructor: 'I1', isOfficial: true },
        { id: '2', code: 'CUSTOM 100', title: 'Custom', instructor: null, isOfficial: false },
      ];

      mockFrom.mockResolvedValue(existingCourses);

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      // Only 1 official course, 1 scraped = 100% threshold met
      // CUSTOM 100 should NOT be deleted (not official)
      expect(result.deleted).toBe(0);
    });

    it('should skip database operations in dry run mode', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_SINGLE_COURSE,
      });

      const result = await syncCourses({ terms: ['Fall 2025'], dryRun: true });

      expect(result.created).toBe(1);
      // Insert should not be called in dry run
      expect(mockValues).not.toHaveBeenCalled();
    });

    it('should return correct total count', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_MULTIPLE_COURSES,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      // After deduplication: CSC 171 (merged) + ACC 201 = 2 unique courses
      expect(result.total).toBe(2);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(syncCourses({ terms: ['Fall 2025'] })).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should handle empty CDCS response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_XML_EMPTY,
      });

      const result = await syncCourses({ terms: ['Fall 2025'] });

      expect(result.total).toBe(0);
      expect(result.created).toBe(0);
    });

    it('should deduplicate across multiple terms', async () => {
      // Same course in both Fall and Spring
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => SAMPLE_XML_SINGLE_COURSE, // CSC 171 in Fall
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => SAMPLE_XML_SINGLE_COURSE, // CSC 171 in Spring
        });

      const result = await syncCourses({ terms: ['Fall 2025', 'Spring 2025'] });

      // Should only count as 1 course
      expect(result.total).toBe(1);
    });
  });

  describe('constants', () => {
    it('should have correct CDCS base URL', () => {
      expect(CDCS_BASE_URL).toBe('https://cdcs.ur.rochester.edu/XMLQuery.aspx');
    });

    it('should have correct default terms', () => {
      expect(DEFAULT_TERMS).toEqual(['Fall 2025', 'Spring 2025']);
    });

    it('should have correct deletion safety threshold', () => {
      expect(DELETION_SAFETY_THRESHOLD).toBe(0.8);
    });
  });
});
