/** "Rp150.000" — integer Rupiah formatted the way PRD examples show it. */
export function formatRupiah(amount: number): string {
  if (!Number.isInteger(amount)) throw new RangeError("Rupiah amounts must be integers");
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp${digits}`;
}
