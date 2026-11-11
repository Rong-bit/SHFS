import * as XLSX from 'xlsx';
import { ClassLogEntry } from '../types';

const DAY_LABELS = ['', '一', '二', '三', '四', '五'] as const;

export function exportClassLogEntries(params: {
  entries: ClassLogEntry[];
  fileName: string;
}) {
  const { entries, fileName } = params;
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.period - b.period ||
      a.className.localeCompare(b.className, 'zh-Hant') ||
      a.subjectName.localeCompare(b.subjectName, 'zh-Hant')
  );
  const header = [
    '日期',
    '星期',
    '節次',
    '班級',
    '科目',
    '場地',
    '原任課教師',
    '填寫／截章者',
    '是否代課填寫',
    '教學進度',
    '測驗或作業',
    '備註',
    '截章時間',
    '更新時間',
  ];
  const rows = sorted.map((e) => [
    e.date,
    DAY_LABELS[e.dayOfWeek] ? `星期${DAY_LABELS[e.dayOfWeek]}` : '',
    `第${e.period}節`,
    e.className,
    e.subjectName,
    e.venueName || '',
    e.originalTeacherName,
    e.authorTeacherName,
    e.isSubstituteFill ? '是' : '否',
    e.progress,
    e.assessment || '',
    e.note || '',
    e.stampedAt.replace('T', ' ').slice(0, 16),
    e.updatedAt.replace('T', ' ').slice(0, 16),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(10, h.length * 2 + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '教室日誌');
  XLSX.writeFile(wb, fileName);
}
