import { describe, it, expect } from 'vitest';

import { formatVectorLiteral } from '@/lib/db/vector-utils';

describe('formatVectorLiteral', () => {
  describe('valid embeddings', () => {
    it('formats a simple embedding array', () => {
      const embedding = [0.1, 0.2, 0.3];
      const result = formatVectorLiteral(embedding);
      expect(result).toBe('[0.1,0.2,0.3]');
    });

    it('formats negative numbers', () => {
      const embedding = [-0.5, 0.0, 0.5];
      const result = formatVectorLiteral(embedding);
      expect(result).toBe('[-0.5,0,0.5]');
    });

    it('formats scientific notation numbers', () => {
      const embedding = [1e-10, 1.5e5, -2.3e-8];
      const result = formatVectorLiteral(embedding);
      expect(result).toBe('[1e-10,150000,-2.3e-8]');
    });

    it('handles large embedding arrays', () => {
      const embedding = new Array(1536).fill(0).map((_, i) => i / 1536);
      const result = formatVectorLiteral(embedding);
      expect(result).toMatch(/^\[[\d.,e+-]+\]$/);
      expect(result.split(',').length).toBe(1536);
    });

    it('handles zero values', () => {
      const embedding = [0, 0.0, -0];
      const result = formatVectorLiteral(embedding);
      expect(result).toBe('[0,0,0]');
    });

    it('handles very small values', () => {
      const embedding = [Number.MIN_VALUE, -Number.MIN_VALUE];
      const result = formatVectorLiteral(embedding);
      expect(result).toMatch(/^\[.+\]$/);
    });
  });

  describe('SQL injection prevention', () => {
    it('throws on array containing strings', () => {
      const malicious = [1.0, "2.0'); DROP TABLE users; --" as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });

    it('throws on array containing objects', () => {
      const malicious = [1.0, {} as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });

    it('throws on array containing null', () => {
      const malicious = [1.0, null as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });

    it('throws on array containing undefined', () => {
      const malicious = [1.0, undefined as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });

    it('throws on array containing arrays', () => {
      const malicious = [1.0, [2.0] as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });

    it('throws on array containing functions', () => {
      const malicious = [1.0, (() => 2.0) as unknown as number];
      expect(() => formatVectorLiteral(malicious)).toThrow('must be a finite number');
    });
  });

  describe('invalid numeric values', () => {
    it('throws on NaN', () => {
      const embedding = [1.0, NaN, 3.0];
      expect(() => formatVectorLiteral(embedding)).toThrow('must be a finite number');
    });

    it('throws on Infinity', () => {
      const embedding = [1.0, Infinity, 3.0];
      expect(() => formatVectorLiteral(embedding)).toThrow('must be a finite number');
    });

    it('throws on negative Infinity', () => {
      const embedding = [1.0, -Infinity, 3.0];
      expect(() => formatVectorLiteral(embedding)).toThrow('must be a finite number');
    });
  });

  describe('invalid input types', () => {
    it('throws on non-array input', () => {
      expect(() => formatVectorLiteral('not an array' as unknown as number[])).toThrow('must be an array');
    });

    it('throws on null input', () => {
      expect(() => formatVectorLiteral(null as unknown as number[])).toThrow('must be an array');
    });

    it('throws on undefined input', () => {
      expect(() => formatVectorLiteral(undefined as unknown as number[])).toThrow('must be an array');
    });

    it('throws on object input', () => {
      expect(() => formatVectorLiteral({ 0: 1.0, length: 1 } as unknown as number[])).toThrow('must be an array');
    });

    it('throws on empty array', () => {
      expect(() => formatVectorLiteral([])).toThrow('cannot be empty');
    });
  });

  describe('error messages include index', () => {
    it('includes the index of invalid value in error message', () => {
      const embedding = [1.0, 2.0, 'bad' as unknown as number, 4.0];
      expect(() => formatVectorLiteral(embedding)).toThrow('index 2');
    });
  });
});
