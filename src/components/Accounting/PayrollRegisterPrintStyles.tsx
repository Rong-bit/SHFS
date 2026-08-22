import React from 'react';

/** 印領清冊列印：A4 直向、橫書、8mm 邊距 */
export const PAYROLL_REGISTER_PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  html, body {
    width: 210mm;
    height: auto;
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body * {
    visibility: hidden;
  }

  .fixed.inset-0 {
    position: static !important;
    overflow: visible !important;
    background: white !important;
  }

  .fixed.inset-0 > div {
    min-height: 0 !important;
    padding: 0 !important;
    display: block !important;
  }

  .payroll-register-print-root,
  .payroll-register-print-root * {
    visibility: visible;
  }

  .payroll-register-print-root {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
  }

  .payroll-register-print-page {
    width: 100%;
    max-width: none;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    break-after: page;
    page-break-after: always;
  }

  .payroll-register-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .payroll-register-print-table {
    width: 100%;
    table-layout: fixed;
    font-size: 9px;
    line-height: 1.35;
  }

  .payroll-register-print-table th,
  .payroll-register-print-table td {
    word-break: break-all;
    overflow-wrap: anywhere;
  }

  .payroll-register-print-title {
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 6px;
    writing-mode: horizontal-tb;
  }

  .payroll-register-print-signature {
    margin-top: 10mm;
    font-size: 10px;
  }
}
`;

export const PayrollRegisterPrintStyles: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: PAYROLL_REGISTER_PRINT_CSS }} />
);
