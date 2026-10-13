import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", "Noto Serif TC", serif';

/**
 * 乙種職名章規格（臺北市版／學校處室主管常用）：
 * 長 2.8cm、寬 0.75cm；橫式由左而右，正楷／隸書。
 */
export const STAMP_HEIGHT_CM = 0.75;
export const STAMP_WIDTH_CM = 2.8;
const STAMP_ASPECT = STAMP_WIDTH_CM / STAMP_HEIGHT_CM; // ≈ 3.733

type ElectronicStampProps = {
  /**
   * 職銜文案（左）：主任／組長為「教師兼教務主任」等；校長為「校長」。
   * 若未提供則以 officeLabel + titleLabel 組成相容舊呼叫。
   */
  stampCaption?: string;
  /** @deprecated 改以 stampCaption；仍相容舊的處室欄 */
  officeLabel?: string;
  /** 職稱短名或完整職銜（無 stampCaption 時使用） */
  titleLabel?: string;
  /** 姓名（右），如 陳柏宇 */
  personName: string;
  /**
   * 螢幕預覽寬度（px）。列印時固定為 2.8cm × 0.75cm。
   * @default 220
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
 * 扁長紅框職名章（實物約 0.75×2.8cm）
 * 排版依機關學校職名章慣例：橫式由左而右——左職銜、右姓名。
 * 例：教師兼教務主任　陳柏宇；校長　○○○
 * 會畢／閱畢請顯示於戳章下方
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  stampCaption,
  officeLabel,
  titleLabel,
  personName,
  actionLabel,
  size = 220,
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
  // viewBox 280×75 對應 2.8×0.75cm；單列橫排，職銜略小於姓名以求平衡
  const captionFont =
    captionLen <= 4 ? 16 : captionLen <= 6 ? 14 : captionLen <= 8 ? 12 : captionLen <= 10 ? 11 : 9.5;
  const nameFont = nameLen <= 2 ? 18 : nameLen === 3 ? 16 : nameLen === 4 ? 14 : 12;

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
        {/* 左：職銜（教師兼教務主任／校長） */}
        <text
          x="14"
          y="40"
          textAnchor="start"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={captionFont}
          letterSpacing="0.04em"
        >
          {caption}
        </text>
        {/* 右：姓名 */}
        <text
          x="266"
          y="40"
          textAnchor="end"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={nameFont}
          letterSpacing="0.18em"
        >
          {name}
        </text>
      </svg>
    </div>
  );
};
