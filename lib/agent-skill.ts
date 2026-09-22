/**
 * Builds a generic SKILL.md that lets an AI agent (e.g. Claude Code) search
 * the user's StudyBuddy materials via the Agent API.
 *
 * The key is read from the STUDYBUDDY_API_KEY env var, never embedded, so the
 * copied skill is safe to commit or share.
 */
export function buildAgentSkill(baseUrl: string): string {
  return `---
name: sb-search-course
description: |
  Search StudyBuddy course materials (lecture transcripts, slides) via the Agent API.
  Use when the user asks to look up course content, find lecture notes, or search their study materials.
---

# StudyBuddy Agent API

Search the user's course materials (lecture transcripts and uploaded slides/PDFs).

## Setup

Requires \`STUDYBUDDY_API_KEY\` (an \`sb_...\` key from StudyBuddy > Settings > Agent API keys)
in the environment. Every request sends it in the \`X-API-Key\` header.

**Base URL:** \`${baseUrl}\`

## Workflow

1. List courses to get course IDs:
   \`\`\`bash
   curl -H "X-API-Key: $STUDYBUDDY_API_KEY" ${baseUrl}/api/agent/courses
   \`\`\`
2. If the question is about a specific lecture or document, list them and note the ID:
   \`\`\`bash
   curl -H "X-API-Key: $STUDYBUDDY_API_KEY" "${baseUrl}/api/agent/lectures?courseId=COURSE_ID"
   curl -H "X-API-Key: $STUDYBUDDY_API_KEY" "${baseUrl}/api/agent/documents?courseId=COURSE_ID"
   \`\`\`
3. Search:
   \`\`\`bash
   curl -X POST -H "X-API-Key: $STUDYBUDDY_API_KEY" -H "Content-Type: application/json" \\
     -d '{"courseId":"COURSE_ID","query":"heap allocation","lectureId":"OPTIONAL_LECTURE_ID"}' \\
     ${baseUrl}/api/agent/search
   \`\`\`

Search returns at most 5 lecture chunks + 5 slide chunks per query, ranked across the whole
course. When the user asks about a specific lecture or document, pass \`lectureId\` or
\`documentId\` so results come from the right source.

Each result has \`content\`, \`source\`, \`type\` (\`lecture\` or \`slide\`), and for lectures a
\`link\` to the video at that timestamp. Cite the source and link in answers.

## Errors

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing API key |
| 400 | Missing required field (\`courseId\`, \`query\`) |
| 403 | Not enrolled in the requested course |
`;
}
