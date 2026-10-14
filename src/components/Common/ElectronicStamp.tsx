import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", "Noto Serif TC", serif';

/**
 * 乙種職名章規格（臺北市版／學校處室主管常用）：
 * 長 2.8cm、寬 0.75cm。
 */
export const STAMP_HEIGHT_CM = 0.75;
export const STAMP_WIDTH_CM = 2.8;
const STAMP_ASPECT = STAMP_WIDTH_CM / STAMP_HEIGHT_CM; // ≈ 3.733

type ElectronicStampProps = {
  /**
   * 職銜文案：主任／組長為「教師兼教務主任」等；校長為「校長」。
   * 長職銜自動拆成二排（兩排同寬對齊）；姓名固定一排。
   */
  stampCaption?: string;
  /** @deprecated 改以 stampCaption；仍相容舊的處室欄 */
  officeLabel?: string;
  /** 職稱短名或完整職銜（無 stampCaption 時使用） */
  titleLabel?: string;
  /** 姓名（右一排），如 陳柏宇 */
  personName: string;
  /**
   * 螢幕預覽寬度（px）。列印時固定為 2.8cm × 0.75cm。
   * @default 240
   */
  size?: number;
  className?: string;
  /** @deprecated 圓戳時代欄位 */
  schoolName?: string;
  /** @deprecated 動作應顯示於戳章外 */
  actionLabel?: string;
  dateLabel?: string;
  stampedAt?: string;
};

/** 職銜拆成至多二排：教師兼／教務主任 */
export function splitStampCaptionLines(caption: string): [string] | [string, string] {
  const t = caption.trim();
  const chars = [...t];
  if (chars.length <= 3) return [t];
  if (t.startsWith('教師兼') && chars.length > 3) {
    return ['教師兼', chars.slice(3).join('')];
  }
  // 其餘長職銜對半切
  const mid = Math.ceil(chars.length / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

/** 在可用寬度內盡量放大字級（約略依全形字寬 ≈ fontSize） */
function maxFontForLine(charCount: number, maxWidth: number, maxFont: number, minFont = 10): number {
  if (charCount <= 0) return maxFont;
  const byWidth = Math.floor(maxWidth / charCount);
  return Math.max(minFont, Math.min(maxFont, byWidth));
}

/**
 * 扁長紅框職名章（實物約 0.75×2.8cm）
 * 左：職銜二排且兩排同寬對齊（例「教　師　兼」對齊「教務主任」）；右：姓名一排
 * 會畢／閱畢請顯示於戳章下方
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  stampCaption,
  officeLabel,
  titleLabel,
  personName,
  actionLabel,
  size = 240,
  className = '',
}) => {
  const caption = (
    stampCaption ||
    [officeLabel, titleLabel || actionLabel].filter(Boolean).join('').trim() ||
    titleLabel ||
    actionLabel ||
    '—'
  )
    .trim()
    .replace(/^已/, '');
  const name = (personName || '').trim() || '—';
  const lines = splitStampCaptionLines(caption);
  const twoLine = lines.length === 2;

  // viewBox 280×75；左欄職銜、右欄姓名
  const leftMaxW = twoLine ? 148 : 130;
  const longestTitle = Math.max(...lines.map((l) => [...l].length));
  const titleFont = maxFontForLine(
    longestTitle,
    leftMaxW,
    twoLine ? 28 : 32,
    twoLine ? 12 : 14
  );
  // 兩排共用同一寬度：左緣對齊、右緣對齊（「教師兼」字距拉開對齊「教務主任」）
  const titleBlockWidth = Math.min(leftMaxW, longestTitle * titleFont);
  const titleLeftX = 14;
  // 姓名較職銜再大一級（上限 38；可用寬略增以免三字名被壓回）
  const nameFont = maxFontForLine([...name].length, 110, 38, 15);

  const widthPx = size;
  const heightPx = size / STAMP_ASPECT;

  return (
    <div
      className={`electronic-stamp-flat ${className}`.trim()}
      style={{
        width: widthPx,
        height: heightPx,
      }}
      aria-hidden
      title={`${caption} ${name}`}
    >
      <svg
        viewBox="0 0 280 75"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <rect
          x="2.5"
          y="2.5"
          width="275"
          height="70"
          fill="none"
          stroke={STAMP_RED}
          strokeWidth="2.4"
          rx="1"
        />

        {/* 左：職銜二排，同寬左右對齊 */}
        {twoLine ? (
          <>
            <text
              x={titleLeftX}
              y="26"
              textAnchor="start"
              dominantBaseline="middle"
              fill={STAMP_RED}
              fontFamily={STAMP_KAI}
              fontSize={titleFont}
              textLength={titleBlockWidth}
              lengthAdjust="spacing"
            >
              {lines[0]}
            </text>
            <text
              x={titleLeftX}
              y="52"
              textAnchor="start"
              dominantBaseline="middle"
              fill={STAMP_RED}
              fontFamily={STAMP_KAI}
              fontSize={titleFont}
              textLength={titleBlockWidth}
              lengthAdjust="spacing"
            >
              {lines[1]}
            </text>
          </>
        ) : (
          <text
            x={titleLeftX + titleBlockWidth / 2}
            y="40"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={STAMP_RED}
            fontFamily={STAMP_KAI}
            fontSize={titleFont}
            letterSpacing="0.12em"
          >
            {lines[0]}
          </text>
        )}

        {/* 右：姓名一排 */}
        <text
          x="215"
          y="40"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={nameFont}
          letterSpacing="0.16em"
        >
          {name}
        </text>
      </svg>
    </div>
  );
};
