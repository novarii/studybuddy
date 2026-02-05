import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const lectureId = process.argv[2];
if (!lectureId) {
  console.error('Usage: node scripts/check-chunks.mjs <lecture-id>');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const result = await pool.query(`
    SELECT content, meta_data
    FROM ai.lecture_chunks_knowledge
    WHERE meta_data->>'lecture_id' = $1
    ORDER BY (meta_data->>'chunk_index')::int
  `, [lectureId]);

  console.log(`Lecture: ${lectureId}`);
  console.log(`Total chunks: ${result.rows.length}`);
  console.log('');

  for (const row of result.rows) {
    const meta = row.meta_data;
    console.log('========================================');
    console.log('Chunk', meta.chunk_index, ':', meta.title);
    console.log('Time:', meta.start_seconds?.toFixed(1) + 's -', meta.end_seconds?.toFixed(1) + 's');
    console.log('');
    console.log(row.content.substring(0, 600) + '...');
    console.log('');
  }

  await pool.end();
}

main().catch(console.error);
