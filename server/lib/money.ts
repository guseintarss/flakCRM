export function formatMinor(value: number | null | undefined): string {
  if (value == null) return '';
  return (value / 100).toFixed(2);
}
