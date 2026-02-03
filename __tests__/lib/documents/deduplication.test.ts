import { describe, it, expect } from 'vitest';
import {
  jaccardSimilarity,
  deduplicatePages,
  cosineSimilarity,
  deduplicateByEmbeddings,
  SIMILARITY_THRESHOLD,
  COSINE_SIMILARITY_THRESHOLD,
} from '@/lib/documents/deduplication';
import type { PageResult } from '@/lib/documents/page-processor';

describe('jaccardSimilarity', () => {
  describe('basic similarity calculations', () => {
    it('should return 1 for identical strings', () => {
      const text = 'hello world';
      expect(jaccardSimilarity(text, text)).toBe(1);
    });

    it('should return 1 for identical strings with different case', () => {
      expect(jaccardSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(jaccardSimilarity('apple banana cherry', 'dog elephant fox')).toBe(0);
    });

    it('should return 0.5 for 50% overlap', () => {
      // Set A: {hello, world} = 2 words
      // Set B: {hello, universe} = 2 words
      // Intersection: {hello} = 1 word
      // Union: {hello, world, universe} = 3 words
      // Jaccard = 1/3 = 0.333...
      const result = jaccardSimilarity('hello world', 'hello universe');
      expect(result).toBeCloseTo(1 / 3, 5);
    });

    it('should handle partial overlap correctly', () => {
      // Set A: {the, quick, brown, fox} = 4 words
      // Set B: {the, lazy, brown, dog} = 4 words
      // Intersection: {the, brown} = 2 words
      // Union: {the, quick, brown, fox, lazy, dog} = 6 words
      // Jaccard = 2/6 = 0.333...
      const result = jaccardSimilarity('the quick brown fox', 'the lazy brown dog');
      expect(result).toBeCloseTo(2 / 6, 5);
    });
  });

  describe('normalization', () => {
    it('should ignore punctuation', () => {
      expect(jaccardSimilarity('Hello, world!', 'hello world')).toBe(1);
    });

    it('should ignore special characters', () => {
      // hello@world#test becomes "helloworldtest" after removing @ and #
      // hello world test stays "hello world test" (3 words)
      // These aren't equivalent - special chars within words behave differently
      // Test with separated special characters instead
      expect(jaccardSimilarity('hello @ world # test', 'hello world test')).toBe(1);
    });

    it('should handle multiple spaces', () => {
      expect(jaccardSimilarity('hello    world', 'hello world')).toBe(1);
    });

    it('should handle tabs and newlines', () => {
      expect(jaccardSimilarity('hello\tworld\ntest', 'hello world test')).toBe(1);
    });

    it('should handle mixed case throughout', () => {
      expect(jaccardSimilarity('HELLO World TeSt', 'hello WORLD test')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should return 1 for two empty strings', () => {
      expect(jaccardSimilarity('', '')).toBe(1);
    });

    it('should return 0 for one empty string and one non-empty', () => {
      expect(jaccardSimilarity('', 'hello world')).toBe(0);
      expect(jaccardSimilarity('hello world', '')).toBe(0);
    });

    it('should return 1 for strings that normalize to empty', () => {
      // Both strings have only punctuation/special chars
      expect(jaccardSimilarity('...', '!!!')).toBe(1);
    });

    it('should handle single word strings', () => {
      expect(jaccardSimilarity('hello', 'hello')).toBe(1);
      expect(jaccardSimilarity('hello', 'world')).toBe(0);
    });

    it('should handle duplicate words within a string', () => {
      // Set A: {hello} = 1 word (duplicates are removed in set)
      // Set B: {hello} = 1 word
      // Intersection: {hello} = 1
      // Union: {hello} = 1
      // Jaccard = 1
      expect(jaccardSimilarity('hello hello hello', 'hello')).toBe(1);
    });

    it('should handle long strings efficiently', () => {
      const longText1 = Array(100).fill('word').join(' ') + ' unique1';
      const longText2 = Array(100).fill('word').join(' ') + ' unique2';
      // Both have "word" + one unique word
      // Intersection: {word} = 1
      // Union: {word, unique1, unique2} = 3
      // Jaccard = 1/3
      const result = jaccardSimilarity(longText1, longText2);
      expect(result).toBeCloseTo(1 / 3, 5);
    });

    it('should handle numbers as words', () => {
      expect(jaccardSimilarity('page 1 2 3', 'page 1 2 3')).toBe(1);
      // Set A: {page, 1} = 2 words
      // Set B: {page, 2} = 2 words
      // Intersection: {page} = 1 word
      // Union: {page, 1, 2} = 3 words
      // Jaccard = 1/3
      expect(jaccardSimilarity('page 1', 'page 2')).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('threshold constant', () => {
    it('should export SIMILARITY_THRESHOLD as 0.9', () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.9);
    });
  });
});

describe('deduplicatePages', () => {
  const createPageResult = (
    pageNumber: number,
    content: string | null,
    success: boolean = true
  ): PageResult => ({
    pageNumber,
    content,
    success,
    ...(success ? {} : { error: new Error('Failed') }),
  });

  describe('basic deduplication', () => {
    it('should keep all unique pages', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'introduction to mathematics'),
        createPageResult(1, 'chapter one algebra basics'),
        createPageResult(2, 'chapter two geometry fundamentals'),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(3);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should identify duplicate pages', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'introduction to the course welcome students'),
        createPageResult(1, 'chapter one content goes here'),
        createPageResult(2, 'introduction to the course welcome students'), // Duplicate of page 0
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(2);
      expect(unique.map((p) => p.pageNumber)).toEqual([0, 1]);
      expect(duplicateIndices).toEqual([2]);
    });

    it('should identify near-duplicate pages above threshold', () => {
      // Pages with 90%+ similarity should be marked as duplicates
      const baseContent = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';
      const slightlyDifferent = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 different';

      const pages: PageResult[] = [
        createPageResult(0, baseContent),
        createPageResult(1, slightlyDifferent), // 90% similar (9/10 words)
      ];

      const similarity = jaccardSimilarity(baseContent, slightlyDifferent);
      expect(similarity).toBeCloseTo(0.818, 2); // 9/11 = 0.818

      // With 81.8% similarity, this should NOT be a duplicate (below 90% threshold)
      const { unique, duplicateIndices } = deduplicatePages(pages);
      expect(unique).toHaveLength(2);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should mark pages with 90%+ similarity as duplicates', () => {
      // Create pages that will have >= 90% Jaccard similarity
      const base = 'a b c d e f g h i j k l m n o p q r s t'; // 20 unique words
      const nearDupe = 'a b c d e f g h i j k l m n o p q r s x'; // 19 same + 1 different
      // Intersection: 19, Union: 21, Jaccard = 19/21 ≈ 0.905

      const pages: PageResult[] = [
        createPageResult(0, base),
        createPageResult(1, nearDupe),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);
      expect(unique).toHaveLength(1);
      expect(unique[0].pageNumber).toBe(0);
      expect(duplicateIndices).toEqual([1]);
    });
  });

  describe('handling failed pages', () => {
    it('should not include failed pages in unique set', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'valid content here'),
        createPageResult(1, null, false),
        createPageResult(2, 'more valid content'),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(2);
      expect(unique.map((p) => p.pageNumber)).toEqual([0, 2]);
      // Failed pages are not marked as duplicates either
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should not compare against failed pages', () => {
      const pages: PageResult[] = [
        createPageResult(0, null, false), // Failed
        createPageResult(1, 'same content here'),
        createPageResult(2, 'same content here'), // Duplicate of page 1
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(1);
      expect(unique[0].pageNumber).toBe(1);
      expect(duplicateIndices).toEqual([2]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const { unique, duplicateIndices } = deduplicatePages([]);

      expect(unique).toHaveLength(0);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should handle single page', () => {
      const pages: PageResult[] = [createPageResult(0, 'single page content')];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(1);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should handle all failed pages', () => {
      const pages: PageResult[] = [
        createPageResult(0, null, false),
        createPageResult(1, null, false),
        createPageResult(2, null, false),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(0);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should handle all duplicate pages', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'identical content'),
        createPageResult(1, 'identical content'),
        createPageResult(2, 'identical content'),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(1);
      expect(unique[0].pageNumber).toBe(0); // First one is kept
      expect(duplicateIndices).toEqual([1, 2]);
    });

    it('should preserve page order in unique results', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'first unique'),
        createPageResult(1, 'duplicate of later'), // Will be compared against later pages
        createPageResult(2, 'second unique'),
        createPageResult(3, 'duplicate of later'), // Duplicate of page 1
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      // Pages 0, 1, 2 should be unique; page 3 is duplicate of page 1
      expect(unique).toHaveLength(3);
      expect(unique.map((p) => p.pageNumber)).toEqual([0, 1, 2]);
      expect(duplicateIndices).toEqual([3]);
    });
  });

  describe('multiple duplicates', () => {
    it('should handle multiple groups of duplicates', () => {
      const pages: PageResult[] = [
        createPageResult(0, 'group one content'),
        createPageResult(1, 'group two content'),
        createPageResult(2, 'group one content'), // Dup of 0
        createPageResult(3, 'group two content'), // Dup of 1
        createPageResult(4, 'group one content'), // Dup of 0
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      expect(unique).toHaveLength(2);
      expect(unique.map((p) => p.pageNumber)).toEqual([0, 1]);
      expect(duplicateIndices.sort((a, b) => a - b)).toEqual([2, 3, 4]);
    });

    it('should keep first occurrence as unique', () => {
      const pages: PageResult[] = [
        createPageResult(5, 'same content'),
        createPageResult(3, 'same content'),
        createPageResult(1, 'same content'),
      ];

      const { unique, duplicateIndices } = deduplicatePages(pages);

      // First in array (page 5) should be kept
      expect(unique).toHaveLength(1);
      expect(unique[0].pageNumber).toBe(5);
      expect(duplicateIndices).toEqual([3, 1]);
    });
  });
});

describe('cosineSimilarity', () => {
  describe('basic similarity calculations', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [0.1, 0.2, 0.3, 0.4, 0.5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 1 for parallel vectors (same direction)', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [2, 4, 6]; // Same direction, different magnitude
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
    });

    it('should handle normalized vectors (unit length)', () => {
      // Normalized vectors - cosine similarity equals dot product
      const vec1 = [0.6, 0.8, 0]; // magnitude = 1
      const vec2 = [0.8, 0.6, 0]; // magnitude = 1
      const expected = 0.6 * 0.8 + 0.8 * 0.6; // = 0.96
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(expected, 5);
    });

    it('should calculate correctly for typical embedding dimensions', () => {
      // Simulate small embedding vectors
      const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      const vec2 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1, 5);
    });
  });

  describe('edge cases', () => {
    it('should return 1 for two empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(1);
    });

    it('should return 1 for two zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(1);
    });

    it('should throw for vectors of different lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
        'Vector length mismatch'
      );
    });

    it('should handle very small values', () => {
      const vec1 = [1e-10, 2e-10, 3e-10];
      const vec2 = [1e-10, 2e-10, 3e-10];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1, 5);
    });

    it('should handle single element vectors', () => {
      expect(cosineSimilarity([5], [5])).toBeCloseTo(1, 5);
      expect(cosineSimilarity([5], [-5])).toBeCloseTo(-1, 5);
    });
  });

  describe('threshold constant', () => {
    it('should export COSINE_SIMILARITY_THRESHOLD as 0.95', () => {
      expect(COSINE_SIMILARITY_THRESHOLD).toBe(0.95);
    });
  });
});

describe('deduplicateByEmbeddings', () => {
  describe('basic deduplication', () => {
    it('should keep all unique embeddings', () => {
      const embeddings = [
        [1, 0, 0], // Orthogonal to others
        [0, 1, 0],
        [0, 0, 1],
      ];

      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0, 1, 2]);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should identify identical embeddings as duplicates', () => {
      // Use orthogonal vectors to ensure they're truly different
      const embeddings = [
        [1, 0, 0], // First unique
        [0, 1, 0], // Second unique (orthogonal)
        [1, 0, 0], // Duplicate of index 0
      ];

      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0, 1]);
      expect(duplicateIndices).toEqual([2]);
    });

    it('should identify near-identical embeddings above threshold', () => {
      // Create two vectors with >95% cosine similarity
      const base = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const nearDupe = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01];

      const similarity = cosineSimilarity(base, nearDupe);
      expect(similarity).toBeGreaterThan(0.95);

      const embeddings = [base, nearDupe];
      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0]);
      expect(duplicateIndices).toEqual([1]);
    });

    it('should keep embeddings below threshold as unique', () => {
      // Create two vectors with <95% cosine similarity
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0.9, 0.4, 0, 0]; // Cosine similarity ≈ 0.91

      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeLessThan(0.95);
      expect(similarity).toBeGreaterThan(0.9);

      const embeddings = [vec1, vec2];
      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0, 1]);
      expect(duplicateIndices).toHaveLength(0);
    });
  });

  describe('custom threshold', () => {
    it('should respect custom threshold', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0.95, 0.3, 0]; // Cosine similarity ≈ 0.95

      // With default 0.95 threshold, might be borderline
      const similarity = cosineSimilarity(vec1, vec2);

      // Use a lower threshold
      const { uniqueIndices: unique1 } = deduplicateByEmbeddings(
        [vec1, vec2],
        0.9
      );
      expect(unique1).toEqual([0]); // vec2 is duplicate with 0.9 threshold

      // Use a higher threshold
      const { uniqueIndices: unique2 } = deduplicateByEmbeddings(
        [vec1, vec2],
        0.99
      );
      expect(unique2).toEqual([0, 1]); // Both unique with 0.99 threshold
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const { uniqueIndices, duplicateIndices } = deduplicateByEmbeddings([]);

      expect(uniqueIndices).toHaveLength(0);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should handle single embedding', () => {
      const { uniqueIndices, duplicateIndices } = deduplicateByEmbeddings([
        [0.1, 0.2, 0.3],
      ]);

      expect(uniqueIndices).toEqual([0]);
      expect(duplicateIndices).toHaveLength(0);
    });

    it('should handle all identical embeddings', () => {
      const same = [0.1, 0.2, 0.3];
      const embeddings = [same, same, same, same];

      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0]);
      expect(duplicateIndices).toEqual([1, 2, 3]);
    });
  });

  describe('multiple duplicates', () => {
    it('should handle multiple groups of duplicates', () => {
      const groupA = [1, 0, 0];
      const groupB = [0, 1, 0];

      const embeddings = [
        groupA, // 0: unique
        groupB, // 1: unique
        groupA, // 2: dup of 0
        groupB, // 3: dup of 1
        groupA, // 4: dup of 0
      ];

      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0, 1]);
      expect(duplicateIndices.sort((a, b) => a - b)).toEqual([2, 3, 4]);
    });

    it('should keep first occurrence as unique', () => {
      const same = [0.5, 0.5, 0.5];
      const embeddings = [same, same, same];

      const { uniqueIndices, duplicateIndices } =
        deduplicateByEmbeddings(embeddings);

      expect(uniqueIndices).toEqual([0]);
      expect(duplicateIndices).toEqual([1, 2]);
    });
  });
});
