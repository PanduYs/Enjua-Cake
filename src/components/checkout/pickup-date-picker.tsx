"use client";

import { createContext, useContext, useMemo } from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { id as idLocale } from "react-day-picker/locale";

import { formatIsoDateLong } from "@/lib/format/date";
import { PICKUP_REASON_LABEL, type PickupReasonCode } from "@/lib/copy/checkout";

export type DateStatus = { date: string; available: true; remaining: number } | { date: string; available: false; reason: PickupReasonCode };

const toLocalDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
};
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export { formatIsoDateLong };

const StatusContext = createContext<ReadonlyMap<string, DateStatus>>(new Map());

/** Module-level so React keeps day buttons mounted (stable focus during keyboard navigation). */
function StatusDayButton({ day, modifiers, ...props }: DayButtonProps) {
  const byDate = useContext(StatusContext);
  const iso = toIso(day.date);
  const status = byDate.get(iso);
  const extra = !status ? "" : status.available ? ", tersedia" : `, tidak tersedia: ${PICKUP_REASON_LABEL[status.reason]}`;
  return (
    <button
      {...props}
      // Not aria-disabled: activating an unavailable date is meaningful — it reveals the reason.
      aria-label={`${formatIsoDateLong(iso)}${extra}`}
      data-unavailable={modifiers.unavailable || undefined}
    />
  );
}

/**
 * Pickup date only, no time slot (FD-10). Unavailable dates stay focusable and
 * announce their reason; choosing one shows the reason instead of selecting it
 * (PRD §7.1, Design §16: reasons not conveyed by color or hover alone).
 */
export function PickupDatePicker({
  statuses,
  selected,
  onSelect,
  onUnavailable,
}: {
  statuses: DateStatus[];
  selected: string | null;
  onSelect: (iso: string) => void;
  onUnavailable: (iso: string, reason: PickupReasonCode) => void;
}) {
  const byDate = useMemo(() => new Map(statuses.map((s) => [s.date, s])), [statuses]);
  const first = statuses[0]?.date;
  const last = statuses.at(-1)?.date;

  const unavailable = useMemo(() => statuses.filter((s) => !s.available).map((s) => toLocalDate(s.date)), [statuses]);

  if (!first || !last) return null;

  return (
    <StatusContext.Provider value={byDate}>
    <DayPicker
      mode="single"
      locale={idLocale}
      weekStartsOn={1}
      startMonth={toLocalDate(first)}
      endMonth={toLocalDate(last)}
      defaultMonth={selected ? toLocalDate(selected) : toLocalDate(first)}
      selected={selected ? toLocalDate(selected) : undefined}
      disabled={[{ before: toLocalDate(first) }, { after: toLocalDate(last) }]}
      modifiers={{ unavailable }}
      modifiersClassNames={{ unavailable: "enjua-day-unavailable" }}
      // onSelect (not onDayClick) keeps DayPicker controlled: without it, DayPicker keeps its own
      // selection and highlights an unavailable day as "selected" while the form holds no date.
      onSelect={(_next, clicked) => {
        const iso = toIso(clicked);
        const status = byDate.get(iso);
        if (!status) return;
        if (status.available) onSelect(iso);
        else onUnavailable(iso, status.reason);
      }}
      components={{ DayButton: StatusDayButton }}
      className="enjua-calendar"
    />
    </StatusContext.Provider>
  );
}
