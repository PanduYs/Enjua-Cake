"use client";

/** Accessible quantity control: buttons + numeric input, respects max (FD-28). */
export function QuantityStepper({
  value,
  onChange,
  max,
  label,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number | null;
  label: string;
  id: string;
}) {
  const clamp = (v: number) => {
    const n = Number.isFinite(v) ? Math.floor(v) : 1;
    return Math.max(1, max ? Math.min(n, max) : n);
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-control border border-muted-foreground bg-surface text-lg disabled:opacity-50"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        aria-label="Kurangi jumlah"
      >
        −
      </button>
      <label htmlFor={id} className="sr-only">
        Jumlah
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max ?? undefined}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-11 w-16 rounded-control border border-muted-foreground bg-surface text-center text-base"
      />
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-control border border-muted-foreground bg-surface text-lg disabled:opacity-50"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== null && value >= max}
        aria-label="Tambah jumlah"
      >
        +
      </button>
    </div>
  );
}
