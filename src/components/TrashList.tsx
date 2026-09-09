"use client";

import { useEffect, useRef, useState } from "react";
import { titleCase, monogram } from "@/lib/text";
import { formatDay } from "@/lib/date";

export type TrashItem = {
  id: string;
  title: string;
  author: string;
  hasThumb: boolean;
  faculty: { code: string; name: string };
  expiresAt: string; // ISO
};

// How long a row's collapse animation runs before it actually leaves the
// list - kept in one place so the CSS duration below and the setTimeout
// that follows it can never drift apart.
const EXIT_MS = 300;

function daysLeft(expiresAt: string, now: number) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000));
}

function TrashRow({
  item,
  selected,
  leaving,
  now,
  onToggle,
}: {
  item: TrashItem;
  selected: boolean;
  leaving: boolean;
  now: number;
  onToggle: (id: string) => void;
}) {
  const title = titleCase(item.title);
  const left = daysLeft(item.expiresAt, now);
  const urgent = left <= 5;

  return (
    // The grid-template-rows trick: animating 1fr -> 0fr collapses the row's
    // height smoothly with no JS measuring the element and no fixed height
    // to guess at up front.
    <div
      className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="overflow-hidden">
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150 sm:gap-4 sm:px-4 ${
            selected ? "border-signal/30 bg-tint" : "border-transparent hover:bg-husk"
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(item.id)}
            className="h-4 w-4 shrink-0 accent-signal"
          />

          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-husk sm:h-16 sm:w-11">
            {item.hasThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/books/${item.id}/thumbnail`}
                alt=""
                className="h-full w-full object-cover object-top"
                loading="lazy"
              />
            ) : (
              <div className="grid h-full place-items-center bg-tint">
                <span className="font-display text-xs text-signal/40">{monogram(title)}</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="truncate font-display text-[0.9375rem] font-medium leading-snug"
              title={title}
            >
              {title}
            </p>
            <p className="truncate text-sm text-ink-soft">{item.author}</p>
            <p className="accession mt-1">{item.faculty.code}</p>
          </div>

          <span
            title={`Auto-deletes ${formatDay(item.expiresAt.slice(0, 10))}`}
            className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] tabular-nums ${
              urgent ? "bg-alert/12 text-alert" : "bg-husk text-ink-soft"
            }`}
          >
            {left <= 0 ? "today" : `${left}d left`}
          </span>
        </label>
      </div>
    </div>
  );
}

export default function TrashList({ items: initialItems }: { items: TrashItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // "Days left" only needs to be right to the day, but a tab left open
  // across midnight should still catch up eventually.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;
  const headerCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
    );
  }

  /** Plays the exit animation for `ids`, then actually drops them from the list. */
  function settle(ids: string[]) {
    if (ids.length === 0) return;
    setLeaving((prev) => new Set([...prev, ...ids]));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setLeaving((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, EXIT_MS);
  }

  async function recoverSelected() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    const ids = [...selected];
    try {
      const res = await fetch("/api/trash/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Nothing was recovered.");
      settle(json.recovered ?? ids);
      if (json.failed?.length) setError(`${json.failed.length} of ${ids.length} did not recover.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was recovered.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteForeverSelected() {
    if (busy || selected.size === 0) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    const ids = [...selected];
    try {
      const res = await fetch("/api/trash", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Nothing was deleted.");
      settle(json.removed ?? ids);
      if (json.failed?.length) setError(`${json.failed.length} of ${ids.length} did not delete.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was deleted.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="panel-dashed px-6 py-16 text-center">
        <p className="font-display text-lg">Trash is empty</p>
        <p className="mt-1.5 text-sm text-ink-soft">A book removed from the catalogue shows up here.</p>
      </div>
    );
  }

  const barOpen = selected.size > 0;

  return (
    <div className="pb-24">
      <label className="row mb-1 cursor-pointer select-none">
        <span className="flex items-center gap-3">
          <input
            ref={headerCheckbox}
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 accent-signal"
          />
          <span className="font-medium text-ink">Select all</span>
        </span>
        <span className="accession">
          {items.length} {items.length === 1 ? "book" : "books"}
        </span>
      </label>

      <div className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <TrashRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            leaving={leaving.has(item.id)}
            now={now}
            onToggle={toggleOne}
          />
        ))}
      </div>

      {/* Floats above the list rather than living inline, so selecting "one"
          or "all" never reflows the rows underneath it. */}
      <div
        className={`pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center transition-all duration-200 ease-out motion-reduce:transition-none sm:inset-x-0 ${
          barOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="panel pointer-events-auto flex w-full max-w-lg flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
          {confirmingDelete ? (
            <>
              <p className="min-w-0 flex-1 text-sm leading-snug">
                Permanently delete <strong>{selected.size}</strong>{" "}
                {selected.size === 1 ? "book" : "books"}? This can&apos;t be undone.
              </p>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={deleteForeverSelected} disabled={busy}>
                  {busy ? "Deleting…" : "Delete forever"}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 text-sm font-medium">{selected.size} selected</span>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-ghost" onClick={() => setSelected(new Set())} disabled={busy}>
                  Clear
                </button>
                <button className="btn btn-primary" onClick={recoverSelected} disabled={busy}>
                  {busy ? "Recovering…" : "Recover"}
                </button>
                <button className="btn btn-danger" onClick={deleteForeverSelected} disabled={busy}>
                  Delete forever
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="pointer-events-none fixed inset-x-4 bottom-24 z-40 flex justify-center sm:inset-x-0"
        >
          <p className="notice notice-error pointer-events-auto max-w-lg">{error}</p>
        </div>
      )}
    </div>
  );
}