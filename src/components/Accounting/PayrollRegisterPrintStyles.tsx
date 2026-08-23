import React from 'react';

/** 印領清冊列印：A4 直向、橫書、8mm 邊距（每邏輯頁對應一張實體紙） */
export const PAYROLL_REGISTER_PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  html, body {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body * {
    visibility: hidden !important;
  }

  .payroll-register-print-root,
  .payroll-register-print-root * {
    visibility: visible !important;
  }

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

  /* 勿用 absolute：會造成瀏覽器誤算高度、多出大量空白頁 */
  .payroll-register-print-root {
    position: static !important;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: white !important;
  }

  .payroll-register-print-page {
    position: relative !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    padding: 0 !important;
    margin: 0 !important;
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

  .payroll-register-print-watermark {
    display: none !important;
  }

  .payroll-register-print-table {
    width: 100% !important;
    table-layout: fixed;
    font-size: 8.5pt;
    line-height: 1.25;
    border-collapse: collapse;
  }

  .payroll-register-print-table th,
  .payroll-register-print-table td {
    overflow-wrap: break-word;
    word-break: break-word;
    border-color: #334155 !important;
    padding: 1.5px 3px !important;
    vertical-align: middle;
  }

  /* 空白列固定矮高；資料列不強制高度，避免備註換行把整頁撐爆 */
  .payroll-register-print-table tr.payroll-register-blank-row td {
    height: 5.2mm;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    line-height: 5.2mm;
    white-space: nowrap;
  }

  .payroll-register-print-table .payroll-register-remarks-col {
    width: 32% !important;
    text-align: left !important;
    white-space: normal !important;
    font-size: 7.5pt;
    line-height: 1.2;
  }

  .payroll-register-print-title {
    font-size: 12pt;
    font-weight: 700;
    text-align: center;
    margin: 0 0 3mm 0;
    writing-mode: horizontal-tb;
  }

  .payroll-register-print-signature {
    margin-top: 6mm;
    font-size: 9pt;
  }
}
`;

export const PayrollRegisterPrintStyles: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: PAYROLL_REGISTER_PRINT_CSS }} />
);
