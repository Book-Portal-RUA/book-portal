import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, canDelete } from "@/auth";
import { prisma } from "@/lib/prisma";
import { permanentlyDelete, trashExpiresAt } from "@/lib/trash";

export const runtime = "nodejs";

/** GET /api/books/trash - every trashed book, admin-only, newest-trashed first. */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Only an admin can see the Trash." }, { status: 403 });
  }

  const books = await prisma.book.findMany({
    where: { deletedAt: { not: null } },
    include: { faculty: true },
    omit: { thumbnail: true },
    orderBy: { deletedAt: "desc" },
  });

  return NextResponse.json({
    books: books.map((b: { deletedAt: Date | null }) => ({
      ...b,
      expiresAt: trashExpiresAt(b.deletedAt!),
    })),
  });
}

const idsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

/**
 * DELETE /api/books/trash - permanently removes the given trashed books.
 *
 * Body: `{ ids: string[] }`. Runs `permanentlyDelete` per ID rather than one
 * transaction over all of them - each book's Drive delete and gap-close is
 * already its own best-effort unit (see lib/trash.ts), and one bad ID in a
 * batch of fifty should not roll back the other forty-nine.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Only an admin can empty the Trash." }, { status: 403 });
  }

  const parsed = idsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "No books were selected." }, { status: 400 });
  }

  const removed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of parsed.data.ids) {
    const result = await permanentlyDelete(id);
    if (result.ok) removed.push(id);
    else failed.push({ id, error: result.error });
  }

  return NextResponse.json({ removed, failed });
}