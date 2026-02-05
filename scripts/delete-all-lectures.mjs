import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('Deleting all lecture data...');
  
  const chunks = await pool.query('DELETE FROM ai.lecture_chunks_knowledge RETURNING 1');
  console.log(`Deleted ${chunks.rowCount} chunks`);
  
  const userLectures = await pool.query('DELETE FROM ai.user_lectures RETURNING 1');
  console.log(`Deleted ${userLectures.rowCount} user_lectures`);
  
  const lectures = await pool.query('DELETE FROM ai.lectures RETURNING 1');
  console.log(`Deleted ${lectures.rowCount} lectures`);
  
  console.log('Done!');
  await pool.end();
}

main().catch(console.error);
