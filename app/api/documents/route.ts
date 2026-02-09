import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';

import { db, documents } from '@/lib/db';
import { computeChecksum } from '@/lib/documents';
import { storeDocument } from '@/lib/storage/documents';
import { processDocument } from '@/lib/documents';

/**
 * Maximum file size for document uploads (10 MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/documents
 *
 * Upload a new PDF document for processing.
 *
 * Request: multipart/form-data with:
 * - file: PDF file
 * - courseId: Course UUID
 *
 * Response:
 * - 202 Accepted: Document created and processing started
 * - 400 Bad Request: Missing or invalid file/courseId
 * - 401 Unauthorized: Not authenticated
 * - 409 Conflict: Document already exists (checksum match)
 * - 413 Payload Too Large: File exceeds size limit
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;

  // Validate courseId
  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  // Validate file presence
  if (!file) {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }

  // Validate file type (PDF only)
  if (file.type !== 'application/pdf') {
    return Response.json(
      { error: 'Only PDF files are allowed' },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    );
  }

  // Read file bytes
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // Compute checksum for duplicate detection
  const checksum = computeChecksum(pdfBytes);

  // Check for existing document with same checksum for this user
  const existingDoc = await db.query.documents.findFirst({
    where: and(eq(documents.userId, userId), eq(documents.checksum, checksum)),
  });

  if (existingDoc) {
    return Response.json(
      {
        error: 'Document already exists',
        existingDocumentId: existingDoc.id,
      },
      { status: 409 }
    );
  }

  // Validate PDF and get page count
  let pageCount: number;
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pageCount = pdfDoc.getPageCount();
  } catch {
    return Response.json(
      { error: 'Invalid PDF file' },
      { status: 400 }
    );
  }

  // Create document record
  const [document] = await db
    .insert(documents)
    .values({
      userId,
      courseId,
      filename: file.name,
      checksum,
      status: 'processing',
      pageCount,
      filePath: '', // Will be updated after storing
    })
    .returning();

  // Store original PDF
  const filePath = await storeDocument(pdfBytes, userId, document.id, 'original');

  // Update file path
  await db
    .update(documents)
    .set({ filePath })
    .where(eq(documents.id, document.id));

  // Start async processing (fire and forget)
  processDocument({
    documentId: document.id,
    pdfBytes,
    userId,
    courseId,
    filename: file.name,
  }).catch((err) => {
    console.error(`[DocumentUpload] Async processing failed for ${document.id}:`, err);
  });

  // Return 202 Accepted with document info
  return Response.json(
    {
      id: document.id,
      filename: document.filename,
      status: document.status,
      pageCount,
      createdAt: document.createdAt.toISOString(),
    },
    { status: 202 }
  );
}

/**
 * GET /api/documents
 *
 * List documents for a course.
 *
 * Query params:
 * - courseId (required): Filter by course
 *
 * Response:
 * - 200 OK: List of documents
 * - 400 Bad Request: Missing courseId
 * - 401 Unauthorized: Not authenticated
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  const docs = await db.query.documents.findMany({
    where: and(
      eq(documents.userId, userId),
      eq(documents.courseId, courseId)
    ),
    orderBy: [desc(documents.createdAt)],
  });

  return Response.json({
    documents: docs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      status: doc.status,
      pageCount: doc.pageCount,
      uniquePageCount: doc.uniquePageCount,
      createdAt: doc.createdAt.toISOString(),
    })),
  });
}
