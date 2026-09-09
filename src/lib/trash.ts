import { prisma } from "@/lib/prisma";
import {
  getStorageDrive,
  deleteFile,
  trashFile,
  untrashFile,
} from "@/lib/drive";
import { closeSequenceGap } from "@/lib/sequence";
import { deleteThumbnail } from "@/lib/storage";

/** How long a book stays recoverable before the sweep removes it for good. */
export const TRASH_RETENTION_DAYS = 30;

/** `deletedAt` -> the moment the sweep is allowed to remove this book. */
export function trashExpiresAt(deletedAt: Date): Date {
  const expires = new Date(deletedAt);
  expires.setUTCDate(expires.getUTCDate() + TRASH_RETENTION_DAYS);
  return expires;
}

const bookInclude = { faculty: true } as const;
const bookOmit = { thumbnail: true } as const;

/**
 * Soft-deletes one book: stamps `deletedAt` and, best-effort, moves its
 * Drive file into Drive's own trash. The row, the thumbnail, and the
 * facultyFolderId/sequenceNumber slot are all left untouched - see the
 * schema comment on Book.deletedAt for why the numbering must not shift yet.
 *
 * Returns null if there is no book with that ID. Already-trashed is treated
 * as success (idempotent) rather than an error, since a double-click on
 * "Move to trash" is a UI race, not a real conflict.
 */
export async function moveToTrash(bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, omit: bookOmit });
  if (!book) return null;
  if (book.deletedAt) return book;

  if (book.driveFileId) {
    await getStorageDrive()
      .then((drive) => trashFile(drive, book.driveFileId!))
      .catch((err) =>
        console.error(`[trash] could not move the Drive file to trash for book ${bookId}`, err),
      );
  }

  return prisma.book.update({
    where: { id: bookId },
    data: { deletedAt: new Date() },
    include: bookInclude,
    omit: bookOmit,
  });
}

/** Reverses moveToTrash: clears `deletedAt` and restores the Drive file. */
export async function recoverFromTrash(bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, omit: bookOmit });
  if (!book) return null;
  if (!book.deletedAt) return book;

  if (book.driveFileId) {
    await getStorageDrive()
      .then((drive) => untrashFile(drive, book.driveFileId!))
      .catch((err) =>
        console.error(`[trash] could not restore the Drive file for book ${bookId}`, err),
      );
  }

  return prisma.book.update({
    where: { id: bookId },
    data: { deletedAt: null },
    include: bookInclude,
    omit: bookOmit,
  });
}

/**
 * Permanently removes one book - the exact cascade the old DELETE handler
 * ran unconditionally: the Drive file gone for good, the thumbnail, the row,
 * then closing the gap it leaves in its faculty folder's numbering. Used by
 * both the "Delete forever" button and the nightly sweep below, so the two
 * can never drift apart.
 */
export async function permanentlyDelete(
  bookId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const book = await prisma.book.findUnique({ where: { id: bookId }, omit: bookOmit });
  if (!book) return { ok: false, error: "No book with that ID." };

  const drive =
    book.driveFileId || book.facultyFolderId ? await getStorageDrive().catch(() => null) : null;

  if (book.driveFileId && drive) {
    await deleteFile(drive, book.driveFileId).catch(() => {});
  }
  await deleteThumbnail(book.id);
  await prisma.book.delete({ where: { id: bookId } });

  if (book.facultyFolderId && book.sequenceNumber != null) {
    try {
      await closeSequenceGap(drive, book.facultyFolderId, book.sequenceNumber);
    } catch (err) {
      console.error(
        `[trash] could not close the gap in ${book.facultyFolderId} at ${book.sequenceNumber} ` +
          `after permanently deleting book ${bookId} - the delete itself succeeded`,
        err,
      );
    }
  }

  return { ok: true };
}

/**
 * The nightly sweep: permanently removes every book whose retention window
 * has passed. Called once at boot and then hourly - see instrumentation.ts
 * for why an interval instead of a real cron expression.
 */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - TRASH_RETENTION_DAYS);

  const expired = await prisma.book.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, title: true },
  });

  let purged = 0;
  for (const book of expired) {
    const result = await permanentlyDelete(book.id);
    if (result.ok) {
      purged++;
    } else {
      console.error(`[trash] auto-purge could not remove book ${book.id} (${book.title}): ${result.error}`);
    }
  }

  if (purged > 0) {
    console.log(`[trash] auto-purge removed ${purged} book(s) past the ${TRASH_RETENTION_DAYS}-day window.`);
  }
  return purged;
}