import Groq from 'groq-sdk';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { config } from 'dotenv';

config({ path: '.env.local' });

const audioPath = process.argv[2] || '/tmp/test-audio.mp3';

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set');
  }

  const stats = await stat(audioPath);
  console.log('File:', audioPath);
  console.log('Size:', (stats.size / 1024).toFixed(2), 'KB');

  const groq = new Groq({
    apiKey,
    timeout: 60 * 1000,
  });

  console.log('Sending to Groq...');
  const start = Date.now();

  const transcription = await groq.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
    language: 'en',
  });

  console.log('Done in', Date.now() - start, 'ms');
  console.log('Text:', transcription.text);
  console.log('Segments:', (transcription as any).segments?.length || 0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
