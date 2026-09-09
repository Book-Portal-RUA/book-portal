import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, canDelete } from "@/auth";
import { recoverFromTrash } from "@/lib/trash";

export const runtime = "nodejs";

const idsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

/**
 * POST /api/books/trash/recover - clears `deletedAt` on the given books and
 * restores their Drive sharing. Body: `{ ids: string[] }`.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canDelete(session.user.role)) {
    return NextResponse.json({ error: "Only an admin can recover a book." }, { status: 403 });
  }

  const parsed = idsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "No books were selected." }, { status: 400 });
  }

  const recovered: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of parsed.data.ids) {
    const book = await recoverFromTrash(id);
    if (book) recovered.push(id);
    else failed.push({ id, error: "No book with that ID." });
  }

  return NextResponse.json({ recovered, failed });
}