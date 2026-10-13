import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", "Noto Serif TC", serif';

/** 實物規格：高 0.75cm × 寬 2.8cm */
export const STAMP_HEIGHT_CM = 0.75;
export const STAMP_WIDTH_CM = 2.8;
const STAMP_ASPECT = STAMP_WIDTH_CM / STAMP_HEIGHT_CM; // ≈ 3.733

type ElectronicStampProps = {
  /**
   * 戳章職銜列，如「教師兼教務主任」。
   * 若未提供則以 officeLabel + titleLabel 組成相容舊呼叫。
   */
  stampCaption?: string;
  /** @deprecated 改以 stampCaption；仍相容舊的處室欄 */
  officeLabel?: string;
  /** 職稱短名或完整職銜（無 stampCaption 時使用） */
  titleLabel?: string;
  /** 姓名，如 陳柏宇 */
  personName: string;
  /**
   * 螢幕預覽寬度（px）。列印時固定為 2.8cm × 0.75cm。
   * @default 210
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

/**
 * 扁長紅框電子戳章（實物約 0.75×2.8cm）
 * 上列職銜（教師兼教務主任）、下列姓名；會畢／閱畢請顯示於戳章下方
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  stampCaption,
  officeLabel,
  titleLabel,
  personName,
  actionLabel,
  size = 210,
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

  const captionLen = [...caption].length;
  const nameLen = [...name].length;
  // viewBox 280×75 對應 2.8×0.75cm 比例
  const captionFont =
    captionLen <= 6 ? 18 : captionLen <= 8 ? 15 : captionLen <= 10 ? 13 : 11;
  const nameFont = nameLen <= 2 ? 22 : nameLen === 3 ? 20 : nameLen === 4 ? 17 : 14;

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
        {/* 上：教師兼教務主任 */}
        <text
          x="140"
          y="28"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={captionFont}
          letterSpacing="0.06em"
        >
          {caption}
        </text>
        {/* 下：姓名 */}
        <text
          x="140"
          y="52"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={nameFont}
          letterSpacing="0.2em"
        >
          {name}
        </text>
      </svg>
    </div>
  );
};
