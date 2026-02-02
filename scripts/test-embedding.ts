import 'dotenv/config';
import { embed } from '../lib/ai/embeddings';

async function test() {
  console.log('Testing embed function with real API...');
  console.log('API key present:', Boolean(process.env.OPENROUTER_API_KEY));

  const embedding = await embed('What is the powerhouse of the cell?');
  console.log('Embedding dimensions:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Embedding test PASSED');
}

test().catch((e: Error) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
