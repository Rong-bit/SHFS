/** 連續用起迄；有缺口列「第2、3、5、7節」 */
export function formatPeriodsLabel(periods: number[]): string {
  const uniq = [...new Set(periods.filter((p) => Number.isFinite(p)))].sort((a, b) => a - b);
  if (uniq.length === 0) return '';
  if (uniq.length === 1) return `第${uniq[0]}節`;
  const contiguous = uniq[uniq.length - 1] - uniq[0] + 1 === uniq.length;
  if (contiguous) return `第${uniq[0]}節～第${uniq[uniq.length - 1]}節`;
  return `第${uniq.join('、')}節`;
}
