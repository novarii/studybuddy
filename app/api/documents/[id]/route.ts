import { auth } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';

import { db, documents } from '@/lib/db';
import { deleteDocument as deleteDocumentStorage } from '@/lib/storage/documents';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/[id]
 *
 * Get document details and processing status.
 *
 * Response:
 * - 200 OK: Document details
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: Not owner of document
 * - 404 Not Found: Document does not exist
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

  // Calculate duplicates removed
  const duplicatesRemoved =
    document.pageCount && document.uniquePageCount
      ? document.pageCount - document.uniquePageCount
      : null;

  return Response.json({
    id: document.id,
    filename: document.filename,
    status: document.status,
    pageCount: document.pageCount,
    uniquePageCount: document.uniquePageCount,
    duplicatesRemoved,
    failedPages: document.failedPages,
    errorMessage: document.errorMessage,
    fileUrl: `/api/documents/${document.id}/file`,
    createdAt: document.createdAt.toISOString(),
    processedAt: document.processedAt?.toISOString() || null,
  });
}

/**
 * DELETE /api/documents/[id]
 *
 * Delete a document, its files, and associated chunks.
 *
 * Response:
 * - 200 OK: Document deleted
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: Not owner of document
 * - 404 Not Found: Document does not exist
 */
export async function DELETE(req: Request, { params }: RouteParams) {
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

  // Delete chunks from vector database
  // The chunks are stored with document_id in metadata
  await db.execute(sql`
    DELETE FROM ai.slide_chunks_knowledge
    WHERE meta_data->>'document_id' = ${documentId}
  `);

  // Delete document record
  await db.delete(documents).where(eq(documents.id, documentId));

  // Delete files from storage
  await deleteDocumentStorage(userId, documentId);

  return Response.json({ success: true });
}
