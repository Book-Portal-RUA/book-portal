"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDay, formatMonth } from "@/lib/date";

/**
 * Filters the catalogue to books added on one day, or in one month.
 *
 * Closed, the button reads "Date" or, once a filter is applied, the day or
 * month itself in the catalogue's own dd-mmm-yyyy / mmm-yyyy style - the
 * same shape BookCard already prints under every cover. Open, a Day/Month
 * toggle switches which native picker is shown; only one of the two is ever
 * applied at a time, since an exact day already implies a month.
 */
export default function DateFilter({
  facultyId,
  query,
  date,
  month,
}: {
  facultyId?: string;
  query?: string;
  date?: string;
  month?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "month">(month && !date ? "month" : "day");
  const [day, setDay] = useState(date ?? "");
  const [monthValue, setMonthValue] = useState(month ?? "");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape, matching the export popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPopover() {
    // Reset the draft to whatever is actually applied, so an edit abandoned
    // the last time this was open never reappears as if it were live.
    setDay(date ?? "");
    setMonthValue(month ?? "");
    setMode(month && !date ? "month" : "day");
    setOpen(true);
  }

  function go(next: { date?: string; month?: string }) {
    const params = new URLSearchParams();
    if (facultyId) params.set("faculty", facultyId);
    if (query) params.set("q", query);
    if (next.date) params.set("date", next.date);
    else if (next.month) params.set("month", next.month);
    const qs = params.toString();
    router.push(qs ? `/books?${qs}` : "/books");
    setOpen(false);
  }

  const active = Boolean(date || month);
  const label = date ? formatDay(date) : month ? formatMonth(month) : "Date";
  const today = new Date().toISOString().slice(0, 10);
  const applyDisabled = mode === "day" ? !day : !monthValue;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-expanded={open}
        className={`btn gap-1.5 ${active ? "border-signal bg-signal text-white" : "btn-ghost"}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 shrink-0"
          aria-hidden
        >
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M8 3.5v3.5M16 3.5v3.5M3.5 10h17" strokeLinecap="round" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (applyDisabled) return;
              if (mode === "day") go({ date: day });
              else go({ month: monthValue });
            }}
          >
            <p className="label">Added</p>

            <div className="mb-3 inline-flex rounded-lg border border-line p-0.5">
              <button
                type="button"
                onClick={() => setMode("day")}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  mode === "day" ? "bg-signal text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setMode("month")}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  mode === "month" ? "bg-signal text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Month
              </button>
            </div>

            {mode === "day" ? (
              <input
                type="date"
                className="field"
                value={day}
                max={today}
                onChange={(e) => setDay(e.target.value)}
                aria-label="Added on this day"
              />
            ) : (
              <input
                type="month"
                className="field"
                value={monthValue}
                max={today.slice(0, 7)}
                onChange={(e) => setMonthValue(e.target.value)}
                aria-label="Added in this month"
              />
            )}

            <p className="accession mt-3 leading-relaxed">
              {mode === "day"
                ? "Shows books added on this exact day."
                : "Shows books added anywhere in this month."}
            </p>

            <div className="mt-4 flex items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={applyDisabled}>
                Apply
              </button>
              {active && (
                <button
                  type="button"
                  className="accession hover:text-signal"
                  onClick={() => go({})}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
