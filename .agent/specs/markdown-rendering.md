# Markdown Rendering

**Status:** Accepted

## Overview

This spec defines the implementation of AI-generated markdown rendering for chat messages using Streamdown, a streaming-optimized markdown library designed for AI applications. The solution must integrate with the existing citation system and support real-time streaming from the Vercel AI SDK.

## Problem Statement

Currently, chat messages are rendered as plain text with citation parsing (`CitationText` component). AI responses often contain:
- Code blocks with syntax highlighting needs
- Formatted lists and tables
- Mathematical expressions
- Emphasis and headers

Without markdown support, these render as raw text, degrading the user experience.

## Solution: Streamdown

**Streamdown** is chosen over alternatives (react-markdown, marked) because:

1. **Streaming-first design**: Handles incomplete markdown during streaming via `remend` preprocessor
2. **AI SDK integration**: Native support for Vercel AI SDK v6 status states
3. **Tailwind v4 compatible**: Works with our existing styling system
4. **Built-in features**: Shiki code highlighting, KaTeX math, Mermaid diagrams, GFM tables
5. **Performance**: Memoized rendering optimized for frequent updates

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Render markdown in assistant messages (headers, lists, emphasis, links) | Must |
| FR-2 | Syntax-highlighted code blocks with copy button | Must |
| FR-3 | Preserve existing citation detection `[1]`, `[2]` as clickable references | Must |
| FR-4 | Handle incomplete markdown during streaming without visual glitches | Must |
| FR-5 | Support GFM tables with proper styling | Should |
| FR-6 | Support KaTeX math expressions (`$$...$$`, `$...$`) | Must |
| FR-7 | User messages remain plain text (no markdown) | Must |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | No layout shift during streaming | Must |
| NFR-2 | Dark/light mode support for code blocks | Must |
| NFR-3 | Responsive typography (mobile-friendly) | Must |
| NFR-4 | Bundle size impact < 100KB gzipped | Should |

## Architecture

### Component Hierarchy

```
MainContent.tsx
  └── MessageBubble (assistant)
        └── MarkdownMessage.tsx (NEW)
              ├── Streamdown (markdown rendering)
              └── CitationLink (custom component for [n] references)
```

### File Structure

```
components/
  └── Chat/
        ├── CitationText.tsx        # Existing - keep for reference
        ├── MarkdownMessage.tsx     # NEW - Streamdown wrapper
        └── CitationLink.tsx        # NEW - Custom citation component
```

## Implementation Design

### MarkdownMessage Component

```tsx
// components/Chat/MarkdownMessage.tsx
'use client';

import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { CitationLink } from './CitationLink';
import { cn } from '@/lib/utils';
import type { RAGSource } from '@/types';

interface MarkdownMessageProps {
  content: string;
  isStreaming: boolean;
  sources?: RAGSource[];
  onCitationClick?: (source: RAGSource) => void;
  accentColor: string;  // Preserve existing theme integration
  className?: string;
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  isStreaming,
  sources = [],
  onCitationClick,
  accentColor,
  className,
}: MarkdownMessageProps) {
  return (
    <Streamdown
      isAnimating={isStreaming}
      className={cn('prose prose-sm dark:prose-invert max-w-none', className)}
      shikiTheme={['github-light', 'github-dark']}
      controls={{ code: true, table: true, mermaid: false }}
      components={{
        // Custom link handler for citations [1], [2], etc.
        a: ({ href, children, ...props }) => {
          // Check if this is a citation link (href="#cite-N")
          const citeMatch = href?.match(/^#cite-(\d+)$/);
          if (citeMatch) {
            const index = parseInt(citeMatch[1], 10) - 1;
            const source = sources[index];
            if (source) {
              return (
                <CitationLink
                  index={index + 1}
                  source={source}
                  onClick={() => onCitationClick?.(source)}
                  accentColor={accentColor}
                />
              );
            }
          }
          // Regular link
          return <a href={href} {...props}>{children}</a>;
        },
      }}
    >
      {preprocessCitations(content)}
    </Streamdown>
  );
});

// Convert [1], [2] citations to markdown links for component override
function preprocessCitations(content: string): string {
  return content.replace(/\[(\d+)\]/g, '[[$1]](#cite-$1)');
}
```

### CitationLink Component

```tsx
// components/Chat/CitationLink.tsx
import type { RAGSource } from '@/types';

interface CitationLinkProps {
  index: number;
  source: RAGSource;
  onClick: () => void;
  accentColor: string;  // Preserve existing theme integration
}

export function CitationLink({ index, source, onClick, accentColor }: CitationLinkProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-5 h-5 text-xs
                 font-medium rounded transition-colors cursor-pointer
                 align-baseline mx-0.5"
      style={{
        backgroundColor: `${accentColor}20`,
        color: accentColor,
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${accentColor}35`}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `${accentColor}20`}
      title={source.title || `Source ${index}`}
    >
      {index}
    </button>
  );
}
```

### Integration in MainContent

```tsx
// In MainContent.tsx, replace CitationText with MarkdownMessage

// Before:
<CitationText
  content={message.content}
  sources={message.sources}
  onCitationClick={onCitationClick}
/>

// After:
<MarkdownMessage
  content={message.content}
  isStreaming={message.isStreaming ?? false}
  sources={message.sources}
  onCitationClick={onCitationClick}
  accentColor={accentColor}
/>
```

## Configuration

### Tailwind v4 Setup

Add to `app/globals.css`:

```css
@source "../node_modules/streamdown/dist/*.js";
```

### Next.js Configuration

Add to `next.config.js` for Shiki compatibility:

```js
module.exports = {
  transpilePackages: ['shiki'],
};
```

## Styling

### Prose Configuration

The `prose` classes from Tailwind Typography provide base markdown styling:

```css
/* Custom prose overrides in globals.css if needed */
.prose pre {
  @apply bg-muted rounded-lg;
}

.prose code:not(pre code) {
  @apply bg-muted px-1.5 py-0.5 rounded text-sm font-mono;
}

.prose a:not(.citation-link) {
  @apply text-primary underline-offset-2;
}
```

### Dark Mode

Streamdown's `shikiTheme` prop handles code block theming:
- Light mode: `github-light`
- Dark mode: `github-dark`

The `dark:prose-invert` class handles general prose dark mode.

## Dependencies

### New Packages

```json
{
  "dependencies": {
    "streamdown": "^latest"
  }
}
```

Streamdown includes these as dependencies:
- `shiki` - Syntax highlighting
- `katex` - Math rendering (lazy-loaded)
- `mermaid` - Diagrams (lazy-loaded)

### Estimated Bundle Impact

| Feature | Size (gzipped) |
|---------|----------------|
| Streamdown core | ~15KB |
| Shiki (with 2 themes) | ~40KB |
| KaTeX | ~25KB |

Total expected: ~80KB gzipped (KaTeX lazy-loads on first math expression)

## Migration Strategy

### Phase 1: Core Implementation
1. Install `streamdown` package
2. Configure Tailwind v4 to include Streamdown classes
3. Create `MarkdownMessage` and `CitationLink` components
4. Replace `CitationText` in assistant messages only
5. User messages remain plain text

### Phase 2: Polish
1. Fine-tune prose styling for dark/light modes
2. Style code block copy buttons
3. Test KaTeX math rendering (`$$...$$` block, `$...$` inline)
4. Test streaming edge cases
5. Performance optimization with React.memo

## Testing Considerations

### Manual Test Cases

1. **Streaming**: Verify no layout shift during streaming
2. **Code blocks**: Test syntax highlighting for Python, JavaScript, SQL, bash
3. **Citations**: Verify `[1]`, `[2]` render as clickable buttons and navigate correctly
4. **Dark mode**: Toggle theme and verify code blocks update
5. **Long content**: Test with long responses containing multiple markdown elements
6. **Incomplete markdown**: Send message mid-stream to test `remend` handling

### Edge Cases

- Citation inside code block (should NOT be converted)
- Nested markdown (bold inside link)
- Very long code blocks (scrolling)
- RTL text support

## Security Considerations

Streamdown includes `rehype-harden` by default which:
- Restricts link protocols to `http`, `https`, `mailto`
- Prevents `javascript:` URLs
- Sanitizes HTML in markdown

No additional security configuration needed for our use case.

## Related Specs

- [Architecture](./architecture.md) - Component hierarchy
- [Streaming Performance](./streaming-performance.md) - Rendering optimization
- [Source Saving Pipeline](./source-saving-pipeline.md) - Citation data flow

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| User message markdown? | No | Users input plain text; only AI responses need formatting |
| KaTeX math support? | Yes | Educational platform benefits from LaTeX math rendering |
| Mermaid diagrams? | No (for now) | Not a priority; can be added later if needed |

## References

- [Streamdown Documentation](https://github.com/vercel/streamdown)
- [Vercel AI SDK v6](https://sdk.vercel.ai/docs)
- [Tailwind Typography](https://tailwindcss.com/docs/typography-plugin)
