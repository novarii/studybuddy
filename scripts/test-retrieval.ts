import 'dotenv/config';
import { Pool } from 'pg';
import { embed } from '../lib/ai/embeddings';
import { searchKnowledge } from '../lib/ai/retrieval';

const TEST_USER_ID = 'test-user-123';
const TEST_COURSE_ID = '00000000-0000-0000-0000-000000000001';
const TEST_DOC_ID = '00000000-0000-0000-0000-000000000002';
const TEST_LECTURE_ID = '00000000-0000-0000-0000-000000000003';

async function insertTestData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('Inserting test data...');

  // Generate embeddings for test content
  const slideContent1 = 'The mitochondria is the powerhouse of the cell. It generates ATP through cellular respiration.';
  const slideContent2 = 'DNA replication occurs in the S phase of the cell cycle.';
  const lectureContent1 = 'Today we will discuss how mitochondria produce energy through oxidative phosphorylation.';
  const lectureContent2 = 'The cell membrane is a phospholipid bilayer that controls what enters and exits the cell.';

  const [emb1, emb2, emb3, emb4] = await Promise.all([
    embed(slideContent1),
    embed(slideContent2),
    embed(lectureContent1),
    embed(lectureContent2),
  ]);
  console.log('Generated embeddings');

  // Insert slide chunks
  await pool.query(`
    INSERT INTO ai.slide_chunks_knowledge (content, meta_data, embedding)
    VALUES
      ($1, $2, $3),
      ($4, $5, $6)
    ON CONFLICT DO NOTHING
  `, [
    slideContent1,
    JSON.stringify({ owner_id: TEST_USER_ID, course_id: TEST_COURSE_ID, document_id: TEST_DOC_ID, slide_number: 5, title: 'Cell Biology' }),
    `[${emb1.join(',')}]`,
    slideContent2,
    JSON.stringify({ owner_id: TEST_USER_ID, course_id: TEST_COURSE_ID, document_id: TEST_DOC_ID, slide_number: 12, title: 'Cell Biology' }),
    `[${emb2.join(',')}]`,
  ]);
  console.log('Inserted slide chunks');

  // Insert lecture chunks
  await pool.query(`
    INSERT INTO ai.lecture_chunks_knowledge (content, meta_data, embedding)
    VALUES
      ($1, $2, $3),
      ($4, $5, $6)
    ON CONFLICT DO NOTHING
  `, [
    lectureContent1,
    JSON.stringify({ course_id: TEST_COURSE_ID, lecture_id: TEST_LECTURE_ID, start_seconds: 120, end_seconds: 180, title: 'Week 3 Lecture' }),
    `[${emb3.join(',')}]`,
    lectureContent2,
    JSON.stringify({ course_id: TEST_COURSE_ID, lecture_id: TEST_LECTURE_ID, start_seconds: 300, end_seconds: 360, title: 'Week 3 Lecture' }),
    `[${emb4.join(',')}]`,
  ]);
  console.log('Inserted lecture chunks');

  await pool.end();
}

async function testRetrieval() {
  console.log('\nTesting searchKnowledge...');

  const result = await searchKnowledge({
    query: 'What is the powerhouse of the cell?',
    userId: TEST_USER_ID,
    courseId: TEST_COURSE_ID,
  });

  console.log('\nContext for LLM:');
  console.log(result.context);
  console.log('\nSources for frontend:');
  result.sources.forEach((s) => {
    console.log(`  [${s.chunk_number}] ${s.source_type}: ${s.content_preview.slice(0, 50)}...`);
  });

  // Verify we got results
  if (result.sources.length > 0) {
    console.log('\nRetrieval test PASSED');
  } else {
    throw new Error('No sources returned');
  }
}

async function main() {
  await insertTestData();
  await testRetrieval();
}

main().catch((e: Error) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
