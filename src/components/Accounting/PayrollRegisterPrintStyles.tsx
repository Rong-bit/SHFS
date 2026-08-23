import React from 'react';

/**
 * 印領清冊列印：A4 直向、橫書、窄邊界
 *
 * 重要：不可只用 visibility:hidden —— 隱形元素仍佔高度，
 * 會先印出整站空白頁，清冊才出現在「最後幾頁」。
 * 改以 display:none 把非清冊節點移出列印流。
 */
export const PAYROLL_REGISTER_PRINT_CSS = `
/* 畫面預覽：空白補列維持短列高；儲存格水平／垂直置中 */
.payroll-register-print-table th,
.payroll-register-print-table td {
  text-align: center;
  vertical-align: middle;
}

.payroll-register-print-table tr.payroll-register-blank-row td {
  height: 5.2mm;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 5.2mm;
  white-space: nowrap;
}

.payroll-register-overload-table col:nth-child(1) { width: 10%; }
.payroll-register-overload-table col:nth-child(2) { width: 10%; }
.payroll-register-overload-table col:nth-child(3) { width: 6.5%; }
.payroll-register-overload-table col:nth-child(4) { width: 8.6%; }
.payroll-register-overload-table col:nth-child(5) { width: 6.5%; }
.payroll-register-overload-table col:nth-child(6) { width: 6.5%; }
.payroll-register-overload-table col:nth-child(7) { width: 6.5%; }
.payroll-register-overload-table col:nth-child(8) { width: 10%; }
.payroll-register-overload-table col:nth-child(9) { width: 35%; }

@media print {
  @page {
    size: A4 portrait;
    margin: 5mm;
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

  /*
   * 隱藏「不是清冊、不是清冊子孫、也不是清冊祖先」的節點。
   * 祖先靠 :has(.payroll-register-print-root) 保留，才不會把 Modal 殼藏掉。
   */
  body *:not(:has(.payroll-register-print-root)):not(.payroll-register-print-root):not(.payroll-register-print-root *) {
    display: none !important;
  }

  /* 清冊祖先取消 min-h-screen／flex 佔高，避免多出空白首頁 */
  body *:has(.payroll-register-print-root) {
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    border: none !important;
  }

  .fixed.inset-0 {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    z-index: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
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
    position: static !important;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: white !important;
    display: block !important;
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
    display: block !important;
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
    display: table !important;
    width: 100% !important;
    table-layout: fixed;
    font-size: 9pt;
    line-height: 1.35;
    border-collapse: collapse;
  }

  .payroll-register-print-table thead {
    display: table-header-group !important;
  }

  .payroll-register-print-table tbody {
    display: table-row-group !important;
  }

  .payroll-register-print-table tr {
    display: table-row !important;
  }

  .payroll-register-print-table th,
  .payroll-register-print-table td {
    display: table-cell !important;
    overflow-wrap: break-word;
    word-break: break-word;
    border-color: #334155 !important;
    padding: 4px 6px !important;
    text-align: center !important;
    vertical-align: middle !important;
  }

  /* 僅空白補列採短列高，資料列維持一般列高 */
  .payroll-register-print-table tr.payroll-register-blank-row td {
    height: 5.2mm;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    line-height: 5.2mm;
    white-space: nowrap;
    font-size: 9pt;
  }

  .payroll-register-print-table .payroll-register-remarks-col {
    width: 35% !important;
    text-align: center !important;
    vertical-align: middle !important;
    white-space: normal !important;
    font-size: 8.5pt;
    line-height: 1.3;
  }

  .payroll-register-print-title {
    display: block !important;
    font-size: 12pt;
    font-weight: 700;
    text-align: center;
    margin: 0 0 3mm 0;
    writing-mode: horizontal-tb;
  }

  .payroll-register-print-signature {
    display: block !important;
    margin-top: 6mm;
    font-size: 9pt;
  }

  /* 確保工具列等 print:hidden 仍隱藏（即使落在祖先內） */
  .print\\:hidden {
    display: none !important;
  }
}
`;

export const PayrollRegisterPrintStyles: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: PAYROLL_REGISTER_PRINT_CSS }} />
);
