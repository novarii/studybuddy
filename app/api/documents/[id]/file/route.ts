import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db, documents } from '@/lib/db';
import { readDocument, documentExists } from '@/lib/storage/documents';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/[id]/file
 *
 * Download the document PDF.
 * Returns the processed (lean) PDF if available, otherwise the original.
 *
 * Response:
 * - 200 OK: PDF file stream
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: Not owner of document
 * - 404 Not Found: Document or file does not exist
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: documentId } = await params;

  const document = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
  });

  if (!document) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  // Verify ownership
  if (document.userId !== userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Prefer processed PDF if available, otherwise use original
  let pdfBytes: Uint8Array;
  let hasProcessed = false;

  try {
    hasProcessed = await documentExists(userId, documentId, 'processed');

    if (hasProcessed) {
      pdfBytes = await readDocument(userId, documentId, 'processed');
    } else {
      pdfBytes = await readDocument(userId, documentId, 'original');
    }
  } catch {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  // Set filename for download
  // Use a cleaner name for the processed version
  const downloadFilename = hasProcessed
    ? document.filename.replace(/\.pdf$/i, '-processed.pdf')
    : document.filename;

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(downloadFilename)}"`,
      'Content-Length': pdfBytes.length.toString(),
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
