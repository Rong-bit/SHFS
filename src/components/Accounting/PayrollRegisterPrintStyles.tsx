import React from 'react';

/** 印領清冊列印：A4 直向、橫書、8mm 邊距 */
export const PAYROLL_REGISTER_PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  html, body {
    width: 210mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* 先隱藏全站，再只顯示清冊（visibility 可讓子層單獨顯示） */
  body * {
    visibility: hidden !important;
  }

  .payroll-register-print-root,
  .payroll-register-print-root * {
    visibility: visible !important;
  }

  /* Modal 外殼：解除遮罩／高度限制，避免列印空白或裁切 */
  .fixed.inset-0 {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    z-index: auto !important;
  }

  .fixed.inset-0 > div {
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
    display: block !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
  }

  .fixed.inset-0 > div > div {
    max-width: none !important;
    max-height: none !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    display: block !important;
  }

  .payroll-register-print-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: white !important;
  }

  .payroll-register-print-page {
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
    margin: 0 0 0 0 !important;
    box-shadow: none !important;
    border: none !important;
    overflow: visible !important;
    break-after: page;
    page-break-after: always;
  }

  .payroll-register-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .payroll-register-print-table {
    width: 100% !important;
    table-layout: fixed;
    font-size: 9pt;
    line-height: 1.35;
    border-collapse: collapse;
  }

  .payroll-register-print-table th,
  .payroll-register-print-table td {
    overflow-wrap: break-word;
    word-break: break-word;
    border-color: #334155 !important;
    padding: 2px 4px !important;
  }

  .payroll-register-print-table tbody tr {
    height: 6.2mm;
  }

  .payroll-register-print-table .payroll-register-remarks-col {
    width: 35% !important;
    min-width: 55mm !important;
    text-align: left !important;
    white-space: normal !important;
  }

  .payroll-register-print-title {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 6px;
    writing-mode: horizontal-tb;
  }

  .payroll-register-print-signature {
    margin-top: 10mm;
    font-size: 10pt;
  }
}
`;

export const PayrollRegisterPrintStyles: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: PAYROLL_REGISTER_PRINT_CSS }} />
);
