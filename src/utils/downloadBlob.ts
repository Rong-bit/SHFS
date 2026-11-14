/**
 * 觸發瀏覽器下載 Blob。
 * 以 IP／區網 http 開啟時，若未把 <a> 掛進 DOM、或立刻 revokeObjectURL，
 * 常會靜默失敗（localhost 較寬鬆）。此處對齊較穩健寫法。
 */
export function downloadBlobFile(blob: Blob, fileName: string): void {
  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (data: Blob, fileName: string) => boolean;
  };
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.type = blob.type || 'application/octet-stream';
  a.style.display = 'none';
  document.body.appendChild(a);
  // 部分瀏覽器對程式化 click 較認 MouseEvent
  a.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
  );

  // 區網／非本機：下載排程較慢，過早 revoke 會讓下載中斷
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60_000);
}

export function formatExportError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    `匯出失敗：${raw || '未知錯誤'}\n\n` +
    '若是用寄信主機的 IP 開啟（非 localhost），請確認瀏覽器未封鎖下載；' +
    '也可改在寄信主機本機用 http://localhost:3000 再開一次試試。'
  );
}
