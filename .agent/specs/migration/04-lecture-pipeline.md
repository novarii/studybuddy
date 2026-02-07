# Phase 4: Lecture Pipeline Migration

**Status:** Draft

## Overview

Migrate lecture processing from Python to Next.js/TypeScript. This includes:
- Panopto integration via browser extension
- Audio/video ingestion (two paths)
- Transcription via RunPod serverless (faster-whisper)
- Semantic chunking via LLM
- Embedding and pgvector storage

### Goals
1. Replace Python transcription service with RunPod serverless
2. Implement semantic chunking for better RAG timestamp accuracy
3. Maintain feature parity with legacy pipeline (including Panopto support)
4. Use BYOK API keys where applicable

### Non-Goals
- Real-time transcription/streaming
- Direct file upload UI (browser extension handles Panopto)

---

## Current Architecture (Python)

```
studybuddy-backend/
├── app/services/
│   ├── lectures_service.py          # Lecture CRUD, pipeline orchestration
│   ├── transcription_service.py     # Whisper HTTP client (poll-based)
│   └── lecture_chunk_pipeline.py    # 180s time-based chunking
└── app/services/downloaders/
    ├── downloader.py                # FFmpeg audio extraction
    └── panopto_downloader.py        # Panopto video download
```

### Legacy Flow
```
Audio Upload → Whisper Server → 180s Chunking → Voyage Embeddings → pgvector
     or
Panopto URL → Download Video → FFmpeg Extract → Whisper → Chunk → Embed → pgvector
```

### Pain Points
- 180s chunks can contain multiple topics
- Timestamp points to chunk start, not topic start
- User must scrub to find relevant content

---

## Target Architecture (Next.js)

```
studybuddy-frontend/
├── app/api/lectures/
│   ├── route.ts                     # GET list
│   ├── audio/route.ts               # POST: extension sends audio bytes (primary)
│   ├── stream/route.ts              # POST: extension sends stream URL (fallback)
│   └── [id]/route.ts                # GET status, DELETE
├── lib/lectures/
│   ├── pipeline.ts                  # Main processing orchestration
│   ├── ffmpeg.ts                    # FFmpeg wrapper (HLS download + audio extraction)
│   ├── runpod-client.ts             # RunPod transcription API
│   ├── chunking/
│   │   ├── index.ts                 # Strategy selector
│   │   ├── time-based.ts            # Legacy 180s approach
│   │   └── semantic.ts              # LLM-based topic detection
│   └── chunk-ingestion.ts           # Embedding + pgvector
└── tmp/                             # Temporary audio files (deleted after processing)
```

**Note:** Audio files are temporary - deleted after transcription completes. Only embeddings persist in pgvector.

---

## Pipeline Flow

### Lecture Deduplication

Lectures are deduplicated by `(courseId, panoptoSessionId)`. If two students upload the same lecture:

1. First student uploads → lecture created, pipeline runs, user gets access
2. Second student uploads → existing lecture found, user gets access (no re-processing)

This is why `userLectures` is a many-to-many join table - multiple users share one lecture record.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEDUPLICATION CHECK                           │
│                                                                  │
│  1. Extract panoptoSessionId from request                       │
│  2. Query: SELECT * FROM lectures                               │
│            WHERE course_id = ? AND panopto_session_id = ?       │
│  3. If exists:                                                  │
│     - Add user-lecture link (if not already linked)             │
│     - Return existing lecture ID (no processing)                │
│  4. If not exists:                                              │
│     - Create lecture record                                     │
│     - Add user-lecture link                                     │
│     - Start processing pipeline                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Two Ingestion Paths

The browser extension handles Panopto authentication and provides two paths:

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION                             │
│                                                                  │
│  1. Detects Panopto lecture page                                │
│  2. Tries to fetch audio from audioPodcast endpoint (PRIMARY)   │
│  3. If fails, extracts video stream URL (FALLBACK)              │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │  PATH 1: PRIMARY  │       │  PATH 2: FALLBACK │
        │  POST /api/       │       │  POST /api/       │
        │  lectures/audio   │       │  lectures/stream  │
        │                   │       │                   │
        │  Body:            │       │  Body:            │
        │  - audio bytes    │       │  - stream_url     │
        │  - session_id     │       │  - panopto_url    │
        │  - course_id      │       │  - course_id      │
        │  - title          │       │  - title          │
        │  - duration       │       │                   │
        └────────┬──────────┘       └────────┬──────────┘
                 │                           │
                 │                           ▼
                 │               ┌───────────────────┐
                 │               │  Download Video   │
                 │               │  from stream_url  │
                 │               └────────┬──────────┘
                 │                        │
                 │                        ▼
                 │               ┌───────────────────┐
                 │               │  FFmpeg Extract   │
                 │               │  Audio            │
                 │               └────────┬──────────┘
                 │                        │
                 └────────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Store Audio    │  uploads/lectures/{id}/audio.m4a
                    │  Create Record  │  Status: pending
                    └────────┬────────┘
                             │
                             ▼ (async pipeline)
```

### Processing Pipeline (shared by both paths)

```
┌─────────────────┐
│  RunPod         │  POST /run → poll /status/{job_id}
│  Transcription  │  Returns: segments with timestamps
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Normalize      │  Remove filler words, detect garbage
│  Transcript     │  Clean text for better embeddings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  LLM Semantic   │  generateObject() with Zod schema
│  Chunking       │  Returns: topic chunks as text
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Match to       │  Fuzzy match LLM chunks → Whisper segments
│  Timestamps     │  Result: chunks with accurate start/end
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Generate       │  OpenRouter text-embedding-3-small
│  Embeddings     │  1536 dimensions (consistent with documents)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Insert to      │  ai.lecture_chunks_knowledge
│  pgvector       │  Metadata: lecture_id, course_id, start_seconds, end_seconds, title
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Delete Temp    │  Remove audio file from tmp/
│  Audio File     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update Status  │  Status: completed
│  Store Metadata │  duration_seconds, chunk_count
└─────────────────┘
```

---

## RunPod Integration

### Endpoint Configuration
```
RUNPOD_API_KEY=xxx
RUNPOD_ENDPOINT_ID=1rh546nxml7kfd
```

### Worker: faster-whisper
Repository: https://github.com/runpod-workers/worker-faster_whisper

### API Contract

**Submit Job:**
```typescript
POST https://api.runpod.ai/v2/{ENDPOINT_ID}/run
Headers:
  Authorization: Bearer {API_KEY}
  Content-Type: application/json
Body:
{
  "input": {
    "audio_base64": "<base64-encoded-audio>",
    "model": "small",
    "language": "en",
    "transcription": "plain_text",
    "word_timestamps": true,
    "enable_vad": false  // Keep accurate timestamps
  }
}

Response:
{
  "id": "job-id-xxx",
  "status": "IN_QUEUE"
}
```

**Poll for Result:**
```typescript
GET https://api.runpod.ai/v2/{ENDPOINT_ID}/status/{job_id}
Headers:
  Authorization: Bearer {API_KEY}

Response (completed):
{
  "id": "job-id-xxx",
  "status": "COMPLETED",
  "output": {
    "transcription": "full text...",
    "segments": [
      { "id": 0, "start": 0.0, "end": 4.2, "text": "Hello..." },
      { "id": 1, "start": 4.2, "end": 8.1, "text": "Today we..." }
    ],
    "detected_language": "en"
  }
}
```

### RunPod Client Implementation

```typescript
// lib/lectures/runpod-client.ts
const RUNPOD_BASE = 'https://api.runpod.ai/v2';

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  transcription: string;
  segments: WhisperSegment[];
  detected_language: string;
}

export async function transcribeAudio(
  audioBase64: string
): Promise<TranscriptionResult> {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID!;
  const apiKey = process.env.RUNPOD_API_KEY!;

  // Submit job
  const submitResponse = await fetch(`${RUNPOD_BASE}/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        audio_base64: audioBase64,
        model: 'small',
        language: 'en',
        transcription: 'plain_text',
        word_timestamps: true,
        enable_vad: false,
      },
    }),
  });

  const { id: jobId } = await submitResponse.json();

  // Poll for result
  return pollForResult(jobId, apiKey, endpointId);
}

async function pollForResult(
  jobId: string,
  apiKey: string,
  endpointId: string,
  maxAttempts = 120,  // 10 minutes at 5s intervals
  interval = 5000
): Promise<TranscriptionResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${RUNPOD_BASE}/${endpointId}/status/${jobId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    const result = await response.json();

    if (result.status === 'COMPLETED') {
      return result.output;
    }

    if (result.status === 'FAILED') {
      throw new Error(`Transcription failed: ${result.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Transcription timeout');
}
```

---

## Transcript Normalization

Before chunking and embedding, clean the transcript to improve quality.

### Problems with Raw Whisper Output
1. **Filler words** - "okay", "um", "uh", "like", "you know", "so", "right", "alright"
2. **Repetition/hallucination** - Whisper sometimes outputs repeated phrases when audio is unclear
3. **Non-semantic content** - These don't help with search and can hurt embedding quality

### Normalization Steps

```typescript
// lib/lectures/normalize.ts

const FILLER_WORDS = [
  'okay', 'ok', 'um', 'uh', 'uhm', 'umm', 'hmm',
  'like', 'you know', 'i mean', 'so', 'right',
  'alright', 'all right', 'yeah', 'yep', 'mhm',
];

// 1. Remove filler words (case-insensitive, word boundaries)
function removeFillerWords(text: string): string {
  let result = text;
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b[,.]?\\s*`, 'gi');
    result = result.replace(regex, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

// 2. Detect garbage (repeated phrases)
function detectGarbage(text: string): boolean {
  // If same phrase repeated 3+ times, likely garbage
  const phrases = text.match(/(.{10,}?)\1{2,}/gi);
  return phrases !== null && phrases.length > 0;
}

// 3. Normalize segment
function normalizeSegment(segment: WhisperSegment): WhisperSegment {
  const cleaned = removeFillerWords(segment.text);
  const isGarbage = detectGarbage(cleaned);

  return {
    ...segment,
    text: isGarbage ? '' : cleaned,  // Empty string for garbage segments
  };
}
```

### When to Apply
- **Before semantic chunking** - LLM sees clean text
- **Before embedding** - cleaner embeddings for RAG
- **Preserve original timestamps** - normalization doesn't affect timing

---

## Semantic Chunking (Experimental)

### Rationale
The legacy 180-second chunking has a UX problem: timestamps point to chunk start, but the relevant topic may be 30+ seconds into the chunk. Users must scrub to find content.

Semantic chunking detects topic boundaries, so each chunk = one topic with accurate timestamp.

### Approach

1. **Whisper** returns segments with exact timestamps
2. **LLM** (cheap model) analyzes transcript text and returns topic boundaries
3. **Matching** maps LLM output back to Whisper segments for accurate timestamps

### Why LLM over Embedding Similarity?
In technical courses (e.g., systems), topics share vocabulary. Embeddings may not detect meaningful boundaries. LLM understands semantic context better.

### Schema

```typescript
// lib/lectures/chunking/semantic.ts
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const SemanticChunksSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().describe('Brief topic title (3-6 words)'),
      text: z.string().describe('The verbatim transcript text for this topic'),
    })
  ),
});

type SemanticChunk = z.infer<typeof SemanticChunksSchema>['chunks'][number];
```

### LLM Prompt

```typescript
const prompt = `You are analyzing a lecture transcript to identify topic boundaries.

Split the transcript into logical chunks where each chunk covers ONE topic or concept.
Return the chunks with:
- title: A brief 3-6 word title for the topic
- text: The EXACT verbatim text from the transcript (do not paraphrase)

Important:
- Each chunk should be a coherent topic (not arbitrary time splits)
- Preserve the exact wording from the transcript
- Typical chunk length: 1-5 minutes of content
- Look for topic transitions: "Now let's talk about...", "Moving on to...", etc.

Transcript:
${transcriptText}`;
```

### Timestamp Matching

```typescript
interface TimestampedChunk {
  title: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  segment_ids: number[];  // Which Whisper segments this covers
}

function matchChunksToTimestamps(
  llmChunks: SemanticChunk[],
  whisperSegments: WhisperSegment[]
): TimestampedChunk[] {
  const results: TimestampedChunk[] = [];
  let segmentIndex = 0;

  for (const chunk of llmChunks) {
    const matchedSegments: WhisperSegment[] = [];
    let accumulatedText = '';

    // Greedily match segments until we've covered the chunk text
    while (segmentIndex < whisperSegments.length) {
      const segment = whisperSegments[segmentIndex];
      matchedSegments.push(segment);
      accumulatedText += ' ' + segment.text;

      // Check if we've matched enough text (fuzzy)
      if (textSimilarity(accumulatedText.trim(), chunk.text) > 0.85) {
        break;
      }

      segmentIndex++;
    }

    if (matchedSegments.length > 0) {
      results.push({
        title: chunk.title,
        text: chunk.text,
        start_seconds: matchedSegments[0].start,
        end_seconds: matchedSegments[matchedSegments.length - 1].end,
        segment_ids: matchedSegments.map(s => s.id),
      });
    }

    segmentIndex++;  // Move past matched segments
  }

  return results;
}
```

### Fallback Strategy

If semantic chunking fails (LLM error, poor matching), fall back to time-based:

```typescript
export async function chunkTranscript(
  segments: WhisperSegment[],
  apiKey: string
): Promise<TimestampedChunk[]> {
  try {
    return await chunkBySemantic(segments, apiKey);
  } catch (error) {
    console.error('Semantic chunking failed, falling back to time-based:', error);
    return chunkByTime(segments, 180);
  }
}
```

### Model Selection

| Model | Cost/1M tokens | Notes |
|-------|----------------|-------|
| `google/gemini-2.0-flash-lite` | ~$0.075 | Recommended - fast, cheap |
| `meta-llama/llama-3.1-8b-instruct` | ~$0.05 | Alternative |

A 1-hour lecture ≈ 15-20k tokens → ~$0.001-0.002 per lecture.

### Status
**Experimental** - This approach needs validation. May iterate based on results.

---

## FFmpeg Integration

FFmpeg handles both video download (from HLS) and audio extraction in one step.

### Fallback Path: HLS Stream → Audio

FFmpeg can download HLS streams directly - no need for a separate HLS library:

```typescript
// lib/lectures/ffmpeg.ts
import { spawn } from 'child_process';

interface FFmpegResult {
  outputPath: string;
  durationSeconds: number;
}

/**
 * Download HLS stream and extract audio in one step.
 * FFmpeg handles: HLS parsing → segment download → audio extraction
 */
export async function downloadAndExtractAudio(
  streamUrl: string,  // CloudFront HLS URL (pre-signed)
  outputPath: string
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',              // Overwrite output
      '-i', streamUrl,   // HLS URL - FFmpeg handles .m3u8 natively
      '-vn',             // No video
      '-acodec', 'aac',  // Audio codec
      '-b:a', '128k',    // Bitrate
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => { stderr += data; });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        const duration = await probeDuration(outputPath);
        resolve({ outputPath, durationSeconds: duration });
      } else {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg not found: ${err.message}`));
    });
  });
}

/**
 * Extract audio from local video file.
 * Used if video is already downloaded.
 */
export async function extractAudioFromFile(
  videoPath: string,
  outputPath: string
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'aac',
      '-b:a', '128k',
      outputPath,
    ]);

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        const duration = await probeDuration(outputPath);
        resolve({ outputPath, durationSeconds: duration });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

/**
 * Get audio duration using ffprobe.
 */
export async function probeDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data; });
    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(Math.round(parseFloat(output)));
      } else {
        resolve(0);  // Unknown duration
      }
    });
    ffprobe.on('error', () => resolve(0));
  });
}
```

### Key Insight

The stream URL from the extension is a pre-signed CloudFront HLS URL:
```
https://d2y36twrtb17ps.cloudfront.net/.../master.m3u8?Policy=...&Signature=...
```

FFmpeg handles HLS natively - no need to:
- Parse .m3u8 playlists manually
- Download .ts segments individually
- Handle AES encryption (FFmpeg does it)
- Port the Python PanoptoDownloader library

**One command does everything:**
```bash
ffmpeg -i "https://cloudfront.../master.m3u8?signed" -vn -acodec aac output.m4a
```

---

## Database Schema

### Lectures Table

Replicate legacy schema in Drizzle with Panopto fields:

```typescript
// lib/db/schema.ts
export const lectures = pgTable('lectures', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull(),

  // Panopto identification
  panoptoSessionId: text('panopto_session_id').notNull(),
  panoptoUrl: text('panopto_url'),
  streamUrl: text('stream_url'),  // Video stream URL or 'audio_podcast' marker

  // Content metadata (no file storage - only embeddings persist)
  title: text('title').notNull(),
  durationSeconds: integer('duration_seconds'),
  chunkCount: integer('chunk_count'),

  // Processing status
  status: text('status').notNull().default('pending'),
  // 'pending' | 'downloading' | 'transcribing' | 'chunking' | 'completed' | 'failed'
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Unique constraint: one lecture per course + panopto session
  courseSessionIdx: uniqueIndex('lectures_course_session_idx')
    .on(table.courseId, table.panoptoSessionId),
}));

// Many-to-many: users can share access to lectures
export const userLectures = pgTable('user_lectures', {
  userId: text('user_id').notNull(),
  lectureId: uuid('lecture_id').notNull().references(() => lectures.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.lectureId] }),
}));
```

### Lecture Chunks Knowledge Table

Already exists: `ai.lecture_chunks_knowledge`

Metadata schema:
```typescript
interface LectureChunkMetadata {
  lecture_id: string;
  course_id: string;
  start_seconds: number;
  end_seconds: number;
  chunk_index: number;
  title?: string;  // NEW: Topic title from semantic chunking
}
```

---

## API Routes

### Route Summary

| Method | Path | Purpose | Caller |
|--------|------|---------|--------|
| POST | `/api/lectures/audio` | Primary: extension sends audio bytes | Browser extension |
| POST | `/api/lectures/stream` | Fallback: extension sends stream URL | Browser extension |
| GET | `/api/lectures` | List lectures for course | Frontend |
| GET | `/api/lectures/[id]` | Get lecture status | Frontend |
| DELETE | `/api/lectures/[id]` | Delete lecture | Frontend |

**Note:** No file download endpoint - audio is temporary and deleted after processing. Only embeddings persist.

### POST /api/lectures/audio - Primary Path

Browser extension sends audio bytes directly (from Panopto audioPodcast endpoint).

```typescript
// app/api/lectures/audio/route.ts
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { lectures } from '@/lib/db/schema';
import { storeLectureAudio } from '@/lib/storage/lectures';
import { processLecture } from '@/lib/lectures/pipeline';

interface UploadAudioRequest {
  courseId: string;
  sessionId: string;      // Panopto session ID
  title: string;
  duration?: number;      // Duration in seconds (if known)
  // audio: base64 or multipart
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const audioFile = formData.get('audio') as File;
  const courseId = formData.get('courseId') as string;
  const sessionId = formData.get('sessionId') as string;
  const title = formData.get('title') as string;
  const duration = formData.get('duration') as string | null;

  if (!audioFile || !courseId || !sessionId || !title) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check for existing lecture (idempotent by course + session)
  const existing = await db.query.lectures.findFirst({
    where: and(
      eq(lectures.courseId, courseId),
      eq(lectures.panoptoSessionId, sessionId)
    ),
  });

  if (existing) {
    // Update title if changed, return existing
    if (existing.title !== title) {
      await db.update(lectures)
        .set({ title })
        .where(eq(lectures.id, existing.id));
    }
    return Response.json({ id: existing.id, created: false });
  }

  // Construct Panopto URL from session ID
  const panoptoUrl = `https://rochester.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=${sessionId}`;

  // Create lecture record
  const [lecture] = await db.insert(lectures).values({
    userId,
    courseId,
    panoptoSessionId: sessionId,
    panoptoUrl,
    streamUrl: 'audio_podcast',  // Marker for direct audio upload
    title,
    durationSeconds: duration ? parseInt(duration, 10) : null,
    status: 'pending',
  }).returning();

  // Store audio file
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const audioKey = await storeLectureAudio(lecture.id, audioBuffer);

  await db.update(lectures)
    .set({ audioStorageKey: audioKey })
    .where(eq(lectures.id, lecture.id));

  // Ensure user-lecture link
  await ensureUserLectureLink(userId, lecture.id);

  // Trigger async processing (don't await)
  processLecture(lecture.id, userId).catch(console.error);

  return Response.json({ id: lecture.id, created: true }, { status: 202 });
}
```

### POST /api/lectures/stream - Fallback Path

Browser extension sends stream URL when audioPodcast is unavailable.

```typescript
// app/api/lectures/stream/route.ts
interface DownloadRequest {
  courseId: string;
  panoptoUrl: string;     // Full Panopto viewer URL
  streamUrl: string;      // Video stream URL to download
  title: string;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body: DownloadRequest = await req.json();
  const { courseId, panoptoUrl, streamUrl, title } = body;

  if (!courseId || !panoptoUrl || !streamUrl || !title) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Extract session ID from Panopto URL
  const sessionId = extractPanoptoSessionId(panoptoUrl);
  if (!sessionId) {
    return Response.json({ error: 'Invalid Panopto URL' }, { status: 400 });
  }

  // Check for existing lecture
  const existing = await db.query.lectures.findFirst({
    where: and(
      eq(lectures.courseId, courseId),
      eq(lectures.panoptoSessionId, sessionId)
    ),
  });

  if (existing) {
    // Update stream URL and title
    await db.update(lectures)
      .set({ streamUrl, title })
      .where(eq(lectures.id, existing.id));
    return Response.json({ id: existing.id, created: false });
  }

  // Create lecture record
  const [lecture] = await db.insert(lectures).values({
    userId,
    courseId,
    panoptoSessionId: sessionId,
    panoptoUrl,
    streamUrl,
    title,
    status: 'pending',
  }).returning();

  // Ensure user-lecture link
  await ensureUserLectureLink(userId, lecture.id);

  // Trigger async download + processing pipeline
  downloadAndProcessLecture(lecture.id, userId).catch(console.error);

  return Response.json({ id: lecture.id, created: true }, { status: 202 });
}

function extractPanoptoSessionId(url: string): string | null {
  // Match ?id=UUID or /sessions/UUID patterns
  const match = url.match(/[?&]id=([a-f0-9-]+)/i)
             || url.match(/\/sessions\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
```

### GET /api/lectures - List Lectures

```typescript
// app/api/lectures/route.ts
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');

  if (!courseId) {
    return Response.json({ error: 'courseId required' }, { status: 400 });
  }

  // Only return lectures the user has access to
  const results = await db.execute(sql`
    SELECT l.* FROM lectures l
    JOIN user_lectures ul ON ul.lecture_id = l.id
    WHERE ul.user_id = ${userId}
    AND l.course_id = ${courseId}
    ORDER BY l.created_at DESC
  `);

  return Response.json({ lectures: results.rows });
}
```

### GET /api/lectures/[id] - Lecture Status

```typescript
// app/api/lectures/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const lecture = await db.query.lectures.findFirst({
    where: and(
      eq(lectures.id, params.id),
      eq(lectures.userId, userId)
    ),
  });

  if (!lecture) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(lecture);
}
```

### DELETE /api/lectures/[id] - Delete Lecture

```typescript
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const lecture = await db.query.lectures.findFirst({
    where: and(
      eq(lectures.id, params.id),
      eq(lectures.userId, userId)
    ),
  });

  if (!lecture) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete from pgvector
  await db.execute(sql`
    DELETE FROM ai.lecture_chunks_knowledge
    WHERE metadata->>'lecture_id' = ${params.id}
  `);

  // Delete lecture record
  await db.delete(lectures).where(eq(lectures.id, params.id));

  // Delete audio file
  await deleteLectureAudio(params.id);

  return new Response(null, { status: 204 });
}
```

---

## Environment Variables

```bash
# RunPod (Transcription)
RUNPOD_API_KEY=xxx
RUNPOD_ENDPOINT_ID=1rh546nxml7kfd

# OpenRouter (for semantic chunking LLM + embeddings)
OPENROUTER_API_KEY=xxx

# Storage
LECTURE_STORAGE_PATH=./uploads/lectures

# Optional: Chunking strategy override
LECTURE_CHUNK_STRATEGY=semantic  # or 'time-based'
```

---

## Migration Considerations

### Embedding Dimension Change

Legacy uses Voyage AI (512 dimensions). New pipeline uses OpenRouter/text-embedding-3-small (1536 dimensions).

**Options:**
1. **Re-embed existing lectures** - Run migration script
2. **Separate tables** - Keep old embeddings, new ones in different table
3. **Accept inconsistency** - Old lectures use 512, new use 1536 (not recommended)

**Recommendation:** Re-embed existing lectures during migration. One-time cost.

### Existing Lectures

If `ai.lecture_chunks_knowledge` has existing data:
1. Export lecture IDs
2. Re-run pipeline on each lecture
3. Delete old chunks, insert new

---

## Testing Strategy

### Unit Tests
- RunPod client (mock API responses)
- Audio extraction (mock FFmpeg)
- Semantic chunking (mock LLM)
- Timestamp matching algorithm

### Integration Tests
- Full pipeline with sample audio
- API route authentication
- Database operations

### E2E Tests
- Upload lecture via UI
- Poll status until complete
- Verify chunks appear in RAG search

### Manual Testing
- Real lecture with multiple topics
- Verify timestamp accuracy (click timestamp, lands at topic)
- Compare semantic vs time-based chunking quality

---

## Audio Preprocessing for Chunking

**Decision (2026-02-06):** Use FLAC (lossless) and preserve stereo when splitting audio into chunks for Groq transcription.

### Problem

Lectures from Panopto SDI captures can have speech on one stereo channel and noise/garbage on the other. The original chunking used `-ac 1` (mono downmix) + `-c:a libmp3lame -b:a 32k` (lossy MP3). This caused:

1. **Mono downmix destroyed SDI audio** - averaging a good channel with a noise channel produces garbage
2. **Whisper hallucination** - garbage audio input caused random text in random languages
3. **Not all lectures affected** - lectures with clean audio on both channels survived the downmix

### Investigation

- Audio downloaded with `-c:a copy` (no re-encoding) sounded fine
- Re-encoded to 16kHz mono FLAC → garbage (confirmed mono downmix is the issue)
- Re-encoded to 16kHz stereo FLAC → good audio (confirmed stereo preserves the good channel)
- Groq/Whisper handles stereo input fine (it downmixes internally in a smarter way)

### Resolution

Changed `lib/lectures/audio-chunking.ts` chunk extraction from:
```
-ar 16000 -ac 1 -c:a libmp3lame -b:a 32k → .mp3
```
To:
```
-ar 16000 -c:a libmp3lame -b:a 64k → .mp3
```

- **Dropped `-ac 1`**: preserves stereo, avoids destructive mono downmix on SDI sources
- **Kept MP3**: FLAC (lossless) chunks were ~31MB per 10min, exceeding Groq's 25MB upload limit
- **Bumped bitrate to 64kbps**: stereo needs more headroom than mono; 64k keeps files ~4.7MB per chunk
- **Backwards compatible**: works for all lectures; stereo MP3 at 64k is well within Groq limits

### Note on FLAC

Groq docs recommend FLAC for preprocessing, but FLAC is lossless and produces files too large
for chunked uploads. FLAC is only practical for short files that don't need chunking (under 10MB).
For chunked transcription, MP3 at 64kbps is a good balance of quality and size.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| RunPod cold starts | Workers stay warm with regular usage; acceptable for async processing |
| LLM chunking quality | Fallback to time-based; iterate on prompt |
| Timestamp matching accuracy | Fuzzy matching with similarity threshold; manual review |
| Large audio files | Stream to base64; consider chunked upload for very large files |
| FFmpeg not available | Passthrough fallback; document requirement |
| SDI audio mono downmix | Keep stereo in chunk preprocessing; use FLAC lossless (see above) |

---

## Success Criteria

1. Lectures upload and process end-to-end
2. Semantic chunks have accurate timestamps (topic start, not chunk start)
3. RAG search returns relevant lecture content
4. BYOK integration works (uses user's OpenRouter key)
5. No calls to Python backend for lectures
6. Processing time < 2 minutes for 1-hour lecture

---

## Open Questions

1. **Max audio file size?** Suggest 100MB (roughly 2 hours at 128kbps)
2. **Concurrent processing limit?** One lecture at a time per user, or queue multiple?
3. **Transcript storage format?** JSON with segments, or also generate VTT for video player?
4. **Retry policy?** If RunPod fails, auto-retry or manual re-trigger?

---

## Related Specs

- [00-overview.md](./00-overview.md) - Migration overview
- [03-document-pipeline.md](./03-document-pipeline.md) - Similar pipeline pattern

## Next Steps

1. Review and approve spec
2. Create task breakdown (`phase4-lecture-pipeline.md`)
3. Implement in order: RunPod client → Chunking → Pipeline → API routes → Tests
