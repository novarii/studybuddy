/**
 * Export lecture chunks to a readable text file.
 * Run with: npx tsx scripts/export-lecture-chunks.ts
 */

import { db } from '../lib/db';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function main() {
  const result = await db.execute(sql`
    SELECT
      meta_data->>'chunk_index' as chunk_index,
      meta_data->>'title' as title,
      meta_data->>'start_seconds' as start_seconds,
      meta_data->>'end_seconds' as end_seconds,
      meta_data->>'lecture_id' as lecture_id,
      content
    FROM ai.lecture_chunks_knowledge
    ORDER BY
      meta_data->>'lecture_id',
      (meta_data->>'chunk_index')::int
  `);

  if (result.rows.length === 0) {
    console.log('No lecture chunks found in database.');
    process.exit(0);
  }

  const output = result.rows.map((row: any) => {
    const startSec = parseFloat(row.start_seconds) || 0;
    const endSec = parseFloat(row.end_seconds) || 0;
    const startMin = Math.floor(startSec / 60);
    const startSecRem = Math.floor(startSec % 60);
    const endMin = Math.floor(endSec / 60);
    const endSecRem = Math.floor(endSec % 60);

    return `
================================================================================
CHUNK ${row.chunk_index}: ${row.title || '(untitled)'}
TIME: ${startMin}:${String(startSecRem).padStart(2, '0')} - ${endMin}:${String(endSecRem).padStart(2, '0')}
LECTURE: ${row.lecture_id}
================================================================================
${row.content}
`;
  }).join('\n');

  const outputPath = 'lecture_chunks_output.txt';
  writeFileSync(outputPath, output);
  console.log(`Wrote ${result.rows.length} chunks to ${outputPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
