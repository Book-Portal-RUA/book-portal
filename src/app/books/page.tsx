import Link from "next/link";
import { auth, canUpload } from "@/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";
import BookCard, { type CardBook } from "@/components/BookCard";
import FacultyRail, { type RailFaculty } from "@/components/FacultyRail";
import ExportCsv from "@/components/ExportCsv";
import DateFilter from "@/components/DateFilter";
import { parseExactDate, parseMonth, formatDay, formatMonth } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ faculty?: string; q?: string; date?: string; month?: string }>;
}) {
  const session = await auth();
  const { faculty: facultyId, q, date: dateParam, month: monthParam } = await searchParams;
  const query = q?.trim();

  // An exact day wins over a month if a hand-edited URL somehow has both -
  // it's the more specific filter. `active*` only ever holds a value that
  // parsed successfully, so a malformed param is dropped everywhere it
  // would otherwise be echoed back: the summary line, the "Clear" link's
  // scope, and every link FacultyRail/DateFilter/ExportCsv build.
  const dateRange = parseExactDate(dateParam);
  const monthRange = dateRange ? null : parseMonth(monthParam);
  const whenRange = dateRange ?? monthRange;
  const activeDate = dateRange ? dateParam : undefined;
  const activeMonth = monthRange ? monthParam : undefined;

  const [faculties, counts, books] = await Promise.all([
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
    prisma.book.groupBy({
      by: ["facultyId"],
      where: { status: "READY" },
      _count: { _all: true },
    }),
    prisma.book.findMany({
      where: {
        status: "READY",
        ...(facultyId ? { facultyId } : {}),
        // MySQL's default collation is case-insensitive, so `contains` needs no
        // mode flag - and Prisma rejects `mode` on MySQL anyway.
        ...(query
          ? { OR: [{ title: { contains: query } }, { author: { contains: query } }] }
          : {}),
        ...(whenRange ? { createdAt: { gte: whenRange.gte, lt: whenRange.lt } } : {}),
      },
      include: { faculty: true },
      omit: { thumbnail: true },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  type Tally = { facultyId: string; _count: { _all: number } };
  const tallies = counts as Tally[];
  const countFor = (id: string) =>
    tallies.find((c) => c.facultyId === id)?._count._all ?? 0;
  const total = tallies.reduce((sum: number, c: Tally) => sum + c._count._all, 0);

  const rail: RailFaculty[] = (
    faculties as { id: string; code: string; name: string }[]
  ).map((f) => ({ ...f, count: countFor(f.id) }));

  const current = rail.find((f) => f.id === facultyId);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header>
          <p className="eyebrow mb-3">
            {current ? `${current.code} · ${current.name}` : "All faculties"}
          </p>
          <h1 className="text-[clamp(2rem,5vw,3.25rem)]">
            {current ? current.name : "The catalogue"}
          </h1>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <form className="flex flex-1 gap-2 sm:flex-none" action="/books">
              {facultyId && <input type="hidden" name="faculty" value={facultyId} />}
              {activeDate && <input type="hidden" name="date" value={activeDate} />}
              {!activeDate && activeMonth && (
                <input type="hidden" name="month" value={activeMonth} />
              )}
              <div className="relative flex-1 sm:w-72 sm:flex-none">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                <input
                  name="q"
                  defaultValue={query ?? ""}
                  className="field pl-9"
                  placeholder="Search title or author"
                  aria-label="Search title or author"
                />
              </div>
              <button className="btn btn-ghost" type="submit">
                Search
              </button>
            </form>

            <DateFilter
              facultyId={facultyId}
              query={query}
              date={activeDate}
              month={activeMonth}
            />

            {books.length > 0 && (
              <ExportCsv
                facultyId={facultyId}
                query={query}
                date={activeDate}
                month={activeMonth}
              />
            )}

            {/* Pushed to the end so the primary action sits where the eye
                lands last on a toolbar it reads left to right. */}
            {canUpload(session?.user.role) && (
              <Link href="/upload" className="btn btn-primary sm:ml-auto">
                Add a book
              </Link>
            )}
          </div>

          {(query || current || activeDate || activeMonth) && (
            <p className="accession mt-4">
              {books.length} {books.length === 1 ? "book" : "books"}
              {query && ` matching “${query}”`}
              {current && ` in ${current.name}`}
              {activeDate && ` added on ${formatDay(activeDate)}`}
              {!activeDate && activeMonth && ` added in ${formatMonth(activeMonth)}`}
              {(query || current || activeDate || activeMonth) && (
                <>
                  {" · "}
                  <Link href="/books" className="hover:text-signal">
                    Clear
                  </Link>
                </>
              )}
            </p>
          )}
        </header>

        <div className="mt-6 grid gap-6 sm:mt-9 lg:grid-cols-[minmax(0,208px)_minmax(0,1fr)] lg:gap-12">
          <aside className="min-w-0">
            <FacultyRail
              faculties={rail}
              total={total}
              activeId={facultyId}
              query={query}
              date={activeDate}
              month={activeMonth}
            />
          </aside>

          <section className="min-w-0">
            {books.length === 0 ? (
              <div className="panel-dashed p-8 text-center sm:p-12">
                <p className="font-display text-xl">Nothing here yet</p>
                <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink-soft">
                  {query
                    ? "No book matches that search. Try fewer words, or clear a filter."
                    : activeDate || activeMonth
                      ? "No book was added in that window. Try a wider date, or clear the filter."
                      : "This faculty has no books yet."}
                </p>
                {canUpload(session?.user.role) &&
                  !query &&
                  !current &&
                  !activeDate &&
                  !activeMonth && (
                    <Link href="/upload" className="btn btn-primary mt-6">
                      Add the first one
                    </Link>
                  )}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 xl:grid-cols-4">
                {books.map((book: CardBook) => (
                  <li key={book.id}>
                    <BookCard book={book} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}