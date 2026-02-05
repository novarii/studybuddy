/**
 * Types for course sync service.
 */

/**
 * Raw course data from CDCS XML response.
 */
export interface CdcsCourse {
  code: string;
  title: string;
  instructor: string | null;
}

/**
 * Result of a course sync operation.
 */
export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  total: number;
  terms: string[];
  deletionSkipped: boolean;
}

/**
 * Options for the syncCourses function.
 */
export interface SyncCoursesOptions {
  terms?: string[];
  courseType?: string;
  dryRun?: boolean;
}

/**
 * Constants for course sync service.
 */
export const CDCS_BASE_URL = 'https://cdcs.ur.rochester.edu/XMLQuery.aspx';
export const DEFAULT_TERMS = ['Fall 2025', 'Spring 2025'];
export const REQUEST_TIMEOUT_MS = 60000; // 60 seconds
export const DELETION_SAFETY_THRESHOLD = 0.8;
