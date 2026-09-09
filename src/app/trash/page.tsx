import { redirect } from "next/navigation";
import { auth, canDelete } from "@/auth";
import { prisma } from "@/lib/prisma";
import { trashExpiresAt, TRASH_RETENTION_DAYS } from "@/lib/trash";
import Nav from "@/components/Nav";
import TrashList from "@/components/TrashList";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const session = await auth();
  if (!session) redirect("/");
  if (!canDelete(session.user.role)) redirect("/books");

  const books = await prisma.book.findMany({
    where: { deletedAt: { not: null } },
    include: { faculty: true },
    omit: { thumbnail: true },
    orderBy: { deletedAt: "desc" },
  });

  const items = books.map(
    (b: {
      id: string;
      title: string;
      author: string;
      hasThumb: boolean;
      faculty: { code: string; name: string };
      deletedAt: Date | null;
    }) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      hasThumb: b.hasThumb,
      faculty: { code: b.faculty.code, name: b.faculty.name },
      expiresAt: trashExpiresAt(b.deletedAt!).toISOString(),
    }),
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="eyebrow mb-3">Trash</p>
        <h1 className="text-[clamp(2rem,5vw,3.25rem)]">Recently removed</h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          A book removed from the catalogue lands here first, still recoverable. After{" "}
          {TRASH_RETENTION_DAYS} days it is deleted for good automatically — select one or
          more to recover them, or to skip the wait and delete them for good now.
        </p>

        <div className="mt-10">
          <TrashList items={items} />
        </div>
      </main>
    </>
  );
}