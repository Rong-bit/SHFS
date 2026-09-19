/**
 * 瀏覽器「另存為 PDF」預設檔名來自 document.title。
 * 列印前暫時換成清冊名稱，列印結束後還原。
 */
export function printWithDocumentTitle(fileTitle: string) {
  const prev = document.title;
  const safe = fileTitle
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  document.title = safe || prev;

  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  // 部分瀏覽器不觸發 afterprint：逾時還原
  window.setTimeout(restore, 60_000);

  window.print();
}
