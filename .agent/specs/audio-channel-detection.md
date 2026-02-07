# Audio Channel Detection for Lecture Transcription

**Status:** Accepted

## Problem

Panopto SDI (Serial Digital Interface) captures can have speech on one stereo channel and noise/garbage on the other. This causes Whisper to hallucinate random text in random languages, even with lossless FLAC encoding.

### Root Cause (Investigated 2026-02-06)

- **Mono downmix (`-ac 1`)** averages both channels → destroys audio when one channel is noise
- **Stereo passthrough** preserves both channels → Whisper still hallucinates because the noise channel interferes with its processing
- **Single channel extraction (`pan=mono|c0=c0`)** isolates the good channel → perfect transcription (`avg_logprob` of `-0.1` vs `-4.0` for stereo)

### Evidence

| Encoding | Human Audible | Whisper avg_logprob | Result |
|----------|--------------|---------------------|--------|
| Raw stereo AAC (no re-encode) | Good | -4.1 | Garbage |
| 16kHz stereo FLAC | Good | -0.9 to -3.5 | Garbage |
| 16kHz mono downmix (`-ac 1`) FLAC | Garbage | N/A | Garbage |
| 16kHz left channel only (`pan=mono\|c0=c0`) FLAC | Good | -0.1 to -0.2 | Perfect |

### Key Insight

Humans naturally focus on the speech channel and ignore noise. Whisper processes both channels and gets confused by the noise, even in stereo mode. The fix is to **select the correct channel before transcription**.

## Solution: Channel Probe Before Chunking

### Flow

```
Audio downloaded → ffprobe channel count
  → If mono: proceed to chunking as-is
  → If stereo:
      1. Extract 30s snippet of left channel (c0) → FLAC
      2. Extract 30s snippet of right channel (c1) → FLAC
      3. Send both to Groq Whisper
      4. Compare avg_logprob across segments
      5. Pick channel with better (less negative) score
      → Split chunks using winning channel
      → Transcribe chunks as normal
```

### Implementation Details

#### 1. Get channel count (new helper in `audio-chunking.ts`)

```typescript
async function getChannelCount(audioPath: string): Promise<number> {
  // Use ffprobe:
  // ffprobe -v error -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 audioPath
  // Returns "1" for mono, "2" for stereo
}
```

#### 2. Probe a channel (new function in `audio-chunking.ts`)

```typescript
async function probeChannel(
  audioPath: string,
  channel: 0 | 1, // 0=left, 1=right
  startSeconds: number = 30 // skip first 30s to avoid intro silence
): Promise<{ avgLogprob: number }> {
  // 1. Extract 30s snippet of specific channel:
  //    ffmpeg -y -ss {startSeconds} -i {audioPath} -t 30 -af "pan=mono|c0=c{channel}" -ar 16000 -c:a flac {tmpPath}
  //
  // 2. Send to Groq Whisper (reuse existing transcribeChunk pattern)
  //
  // 3. Parse response, average the avg_logprob across all segments
  //
  // 4. Clean up temp file, return average score
}
```

#### 3. Select best channel (new function in `audio-chunking.ts`)

```typescript
async function selectBestChannel(audioPath: string): Promise<number | null> {
  const channels = await getChannelCount(audioPath);
  if (channels <= 1) return null; // mono, no selection needed

  const [leftScore, rightScore] = await Promise.all([
    probeChannel(audioPath, 0),
    probeChannel(audioPath, 1),
  ]);

  // Higher (less negative) avg_logprob = better transcription
  return leftScore.avgLogprob >= rightScore.avgLogprob ? 0 : 1;
}
```

#### 4. Update `splitAudioIntoChunks` to accept channel parameter

Add optional `channel` parameter. When set, add `-af "pan=mono|c0=c{channel}"` to the ffmpeg args for each chunk extraction.

Current chunk ffmpeg args:
```
-y -ss {start} -i {audioPath} -t {duration} -ar 16000 -c:a flac {chunkPath}
```

With channel selection:
```
-y -ss {start} -i {audioPath} -t {duration} -af "pan=mono|c0=c{channel}" -ar 16000 -c:a flac {chunkPath}
```

Without channel selection (mono input):
```
-y -ss {start} -i {audioPath} -t {duration} -ar 16000 -c:a flac {chunkPath}
```

#### 5. Update `transcribeWithChunking` entry point

```typescript
export async function transcribeWithChunking(audioPath: string): Promise<TranscriptionResult> {
  // NEW: Detect best channel before chunking
  const bestChannel = await selectBestChannel(audioPath);

  // Pass channel to splitAudioIntoChunks
  const chunks = await splitAudioIntoChunks(audioPath, chunkLengthSeconds, overlapSeconds, bestChannel);

  // Rest of pipeline unchanged...
}
```

### Chunk Duration & Encoding

- **Encoding:** FLAC (lossless) at 16kHz
- **Mono chunks (after channel selection):** ~15MB per 10-min chunk → fits within Groq 25MB limit. Use `DEFAULT_CHUNK_LENGTH_SECONDS = 600`
- **Stereo chunks (if both channels are good):** ~31MB per 10-min chunk → exceeds limit. Use 5-min chunks (300s) or always extract single channel after probe

**Recommendation:** Always extract the winning channel as mono. Even when both channels score equally (normal stereo), extracting one channel is safe and keeps chunk sizes small. This simplifies the logic — no need for separate stereo vs mono chunk durations.

### Edge Cases

| Case | Handling |
|------|----------|
| Mono input | Skip probe, chunk as-is |
| Both channels score similarly | Pick left (channel 0) — both are fine |
| First 30s is silence | Start probe at 30s into the audio (skip intro) |
| Probe snippet too small (<5s) | Skip probe, default to left channel |
| Groq probe call fails | Default to left channel, log warning |
| Audio shorter than 60s | Won't hit chunking path (file < 10MB), irrelevant |

### Overhead

- **2 extra Groq API calls** with 30s audio each
- **~10-15 seconds** additional processing time
- **Only for stereo files** — mono files skip entirely

## Files to Modify

- `lib/lectures/audio-chunking.ts` — main changes (channel detection, probe, chunk extraction)
- `.agent/specs/migration/04-lecture-pipeline.md` — update the "Audio Preprocessing for Chunking" section

## Verification

1. **Unit test:** Mock ffprobe returning 1 channel → confirm probe is skipped
2. **Unit test:** Mock ffprobe returning 2 channels → confirm both channels are probed
3. **Manual test:** Re-process the failing SDI lecture (Panopto session `6a78787c-ed9f-4910-abad-b3d90158de4a`) and verify clean transcription
4. **Manual test:** Re-process a working non-SDI lecture and verify it still works
5. **Check logs:** Confirm channel detection logs appear: `[AudioChunking] Detected 2 channels, probing...` and `[AudioChunking] Selected channel 0 (avg_logprob: -0.15 vs -4.02)`

## Related

- [migration/04-lecture-pipeline.md](./migration/04-lecture-pipeline.md) — parent spec, contains audio preprocessing decision history
