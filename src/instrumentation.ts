/**
 * Runs the Trash auto-purge sweep on a timer for the life of the server.
 *
 * `register()` is called once when the Next.js server starts - see
 * https://nextjs.org/docs/app/guides/instrumentation. That is exactly the
 * shape a background job needs here: docker-compose.yml runs a single
 * always-on `app` container (no replicas), so one process owning one
 * interval is enough - there is no second instance it could double-fire
 * against. An hourly plain `setInterval` is deliberately not a real cron
 * expression: the 30-day retention window (TRASH_RETENTION_DAYS in
 * lib/trash.ts) does not need minute-level precision, an hourly sweep costs
 * one indexed query when nothing has expired, and it avoids adding a cron
 * dependency for something this simple.
 *
 * globalThis guard: `next dev`'s hot reload calls register() again on every
 * edit, which would otherwise stack a fresh interval on top of the last one
 * every time a file saves. Same problem, same fix, as the PrismaClient
 * singleton in lib/prisma.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const globalForTrash = globalThis as unknown as { trashSweepInterval?: NodeJS.Timeout };
    if (globalForTrash.trashSweepInterval) return;

    const { purgeExpiredTrash } = await import("@/lib/trash");
    const HOUR_MS = 60 * 60 * 1000;

    const sweep = () => {
      purgeExpiredTrash().catch((err) => console.error("[trash] auto-purge sweep failed", err));
    };

    // Delayed first run: let the DB connection settle before the first query
    // rather than racing it at the instant the process comes up.
    setTimeout(sweep, 30_000);
    globalForTrash.trashSweepInterval = setInterval(sweep, HOUR_MS);
  }
}