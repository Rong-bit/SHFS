import React from 'react';
import {
  PAYROLL_PRINT_HEIGHT_FUDGE,
  PAYROLL_PRINT_PAGE_MM,
  PAYROLL_PRINT_PAGE_SAFETY_MM,
} from '../../utils/overloadPayrollRegister';

/**
 * 以隱藏探針表量測列印列高，回傳每列 px 與單頁資料區可用高度。
 * 探針需套用 .payroll-register-measure-probe（對齊列印字級／欄寬）。
 * 列高會乘上 FUDGE、容量扣 SAFETY，避免塞滿後小計被擠到下一頁。
 */
export function usePayrollRowHeightProbe(rowCount: number) {
  const probeRef = React.useRef<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = React.useState<{
    heightsPx: number[];
    pageCapacityPx: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const root = probeRef.current;
    if (!root || rowCount <= 0) {
      setMeasurement(null);
      return;
    }

    const measure = () => {
      const table = root.querySelector('table.payroll-register-measure-table');
      const title = root.querySelector('.payroll-register-measure-title');
      const thead = table?.querySelector('thead');
      const footer = root.querySelector('.payroll-register-measure-footer');
      const bodyRows = table?.querySelectorAll('tbody tr');
      if (!table || !bodyRows || bodyRows.length === 0) {
        setMeasurement(null);
        return;
      }

      const tableWidthPx = table.getBoundingClientRect().width;
      if (tableWidthPx < 8) {
        setMeasurement(null);
        return;
      }
      const pxPerMm = tableWidthPx / 200; // 探針表寬固定 200mm
      const chromePx =
        (title?.getBoundingClientRect().height || 0) +
        (thead?.getBoundingClientRect().height || 0) +
        (footer?.getBoundingClientRect().height || 0);
      const pageCapacityPx = Math.max(
        1,
        (PAYROLL_PRINT_PAGE_MM - PAYROLL_PRINT_PAGE_SAFETY_MM) * pxPerMm - chromePx
      );
      const heightsPx = Array.from(bodyRows).map((tr) =>
        Math.max(
          1,
          (tr as HTMLElement).getBoundingClientRect().height * PAYROLL_PRINT_HEIGHT_FUDGE
        )
      );
      setMeasurement({ heightsPx, pageCapacityPx });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  }, [rowCount]);

  return { probeRef, measurement };
}
