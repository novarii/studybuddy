import { describe, it, expect } from 'vitest';
import {
  formatRetrievalContext,
  formatTimestamp,
} from '@/lib/ai/retrieval';
import type { RetrievalResult } from '@/lib/ai/types';

describe('formatTimestamp', () => {
  it('formats seconds under a minute', () => {
    expect(formatTimestamp(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(125)).toBe('2:05');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });

  it('handles zero', () => {
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('pads single-digit seconds', () => {
    expect(formatTimestamp(62)).toBe('1:02');
  });

  it('pads single-digit minutes in hour format', () => {
    expect(formatTimestamp(3605)).toBe('1:00:05');
  });
});

describe('formatRetrievalContext', () => {
  it('numbers slides and lectures sequentially', () => {
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-1',
        content: 'Slide content about mitochondria',
        documentId: 'doc-1',
        slideNumber: 5,
        title: 'Biology 101',
        courseId: 'course-1',
        similarity: 0.9,
      },
      {
        type: 'lecture',
        id: 'lecture-1',
        content: 'Lecture content about cells',
        lectureId: 'lec-1',
        startSeconds: 120,
        endSeconds: 180,
        title: 'Cell Biology',
        courseId: 'course-1',
        similarity: 0.85,
      },
    ];

    const { context, sources } = formatRetrievalContext(results);

    expect(context).toContain('[1] (Slide 5)');
    expect(context).toContain('[2] (Lecture @2:00)');
    expect(sources[0].chunk_number).toBe(1);
    expect(sources[1].chunk_number).toBe(2);
  });

  it('generates correct source_id for slides', () => {
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-1',
        content: 'Test content',
        documentId: 'abc-123',
        slideNumber: 3,
        title: null,
        courseId: 'course-1',
        similarity: 0.9,
      },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].source_id).toBe('slide-abc-123-3');
    expect(sources[0].source_type).toBe('slide');
  });

  it('generates correct source_id for lectures', () => {
    const results: RetrievalResult[] = [
      {
        type: 'lecture',
        id: 'lecture-1',
        content: 'Lecture content',
        lectureId: 'lec-456',
        startSeconds: 90,
        endSeconds: 150,
        title: null,
        courseId: 'course-1',
        similarity: 0.85,
      },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].source_id).toBe('lecture-lec-456-90');
    expect(sources[0].source_type).toBe('lecture');
  });

  it('includes content preview in sources', () => {
    const longContent = 'A'.repeat(300);
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-1',
        content: longContent,
        documentId: 'doc-1',
        slideNumber: 1,
        title: 'Test',
        courseId: 'course-1',
        similarity: 0.9,
      },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].content_preview.length).toBeLessThanOrEqual(200);
    expect(sources[0].content_preview).toBe('A'.repeat(200));
  });

  it('handles empty results array', () => {
    const { context, sources } = formatRetrievalContext([]);

    expect(context).toBe('');
    expect(sources).toEqual([]);
  });

  it('preserves slide metadata in sources', () => {
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-1',
        content: 'Content',
        documentId: 'doc-xyz',
        slideNumber: 10,
        title: 'Chapter 5',
        courseId: 'course-abc',
        similarity: 0.95,
      },
    ];

    const { sources } = formatRetrievalContext(results);
    const source = sources[0];

    expect(source.document_id).toBe('doc-xyz');
    expect(source.slide_number).toBe(10);
    expect(source.course_id).toBe('course-abc');
    expect(source.title).toBe('Chapter 5');
  });

  it('preserves lecture metadata in sources', () => {
    const results: RetrievalResult[] = [
      {
        type: 'lecture',
        id: 'lecture-1',
        content: 'Content',
        lectureId: 'lec-xyz',
        startSeconds: 300,
        endSeconds: 360,
        title: 'Week 3',
        courseId: 'course-abc',
        similarity: 0.88,
      },
    ];

    const { sources } = formatRetrievalContext(results);
    const source = sources[0];

    expect(source.lecture_id).toBe('lec-xyz');
    expect(source.start_seconds).toBe(300);
    expect(source.end_seconds).toBe(360);
    expect(source.course_id).toBe('course-abc');
    expect(source.title).toBe('Week 3');
  });

  it('orders slides before lectures in context', () => {
    const results: RetrievalResult[] = [
      {
        type: 'lecture',
        id: 'lecture-1',
        content: 'Lecture first in array',
        lectureId: 'lec-1',
        startSeconds: 0,
        endSeconds: 60,
        title: null,
        courseId: 'course-1',
        similarity: 0.9,
      },
      {
        type: 'slide',
        id: 'slide-1',
        content: 'Slide second in array',
        documentId: 'doc-1',
        slideNumber: 1,
        title: null,
        courseId: 'course-1',
        similarity: 0.85,
      },
    ];

    const { context, sources } = formatRetrievalContext(results);

    // Slides should come first in context (chronological ordering)
    const slidePosition = context.indexOf('Slide second in array');
    const lecturePosition = context.indexOf('Lecture first in array');
    expect(slidePosition).toBeLessThan(lecturePosition);

    // Sources should reflect the same ordering
    expect(sources[0].source_type).toBe('slide');
    expect(sources[1].source_type).toBe('lecture');
  });

  it('sorts slides by slide number', () => {
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-2',
        content: 'Slide 10 content',
        documentId: 'doc-1',
        slideNumber: 10,
        title: null,
        courseId: 'course-1',
        similarity: 0.9,
      },
      {
        type: 'slide',
        id: 'slide-1',
        content: 'Slide 5 content',
        documentId: 'doc-1',
        slideNumber: 5,
        title: null,
        courseId: 'course-1',
        similarity: 0.85,
      },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].slide_number).toBe(5);
    expect(sources[1].slide_number).toBe(10);
  });

  it('sorts lectures by start time', () => {
    const results: RetrievalResult[] = [
      {
        type: 'lecture',
        id: 'lecture-2',
        content: 'Later lecture',
        lectureId: 'lec-1',
        startSeconds: 300,
        endSeconds: 360,
        title: null,
        courseId: 'course-1',
        similarity: 0.9,
      },
      {
        type: 'lecture',
        id: 'lecture-1',
        content: 'Earlier lecture',
        lectureId: 'lec-1',
        startSeconds: 60,
        endSeconds: 120,
        title: null,
        courseId: 'course-1',
        similarity: 0.85,
      },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].start_seconds).toBe(60);
    expect(sources[1].start_seconds).toBe(300);
  });

  it('includes full content in context string', () => {
    const results: RetrievalResult[] = [
      {
        type: 'slide',
        id: 'slide-1',
        content: 'The mitochondria is the powerhouse of the cell.',
        documentId: 'doc-1',
        slideNumber: 1,
        title: null,
        courseId: 'course-1',
        similarity: 0.9,
      },
    ];

    const { context } = formatRetrievalContext(results);

    expect(context).toContain('The mitochondria is the powerhouse of the cell.');
    expect(context).toMatch(/\[1\] \(Slide 1\) The mitochondria/);
  });
});
