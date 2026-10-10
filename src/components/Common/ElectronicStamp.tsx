import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", "Noto Serif TC", serif';

type ElectronicStampProps = {
  /** 左上處室／單位，如 會計室、生輔組 */
  officeLabel: string;
  /** 左下職稱或動作，如 主任、會畢、閱畢 */
  titleLabel: string;
  /** 右側姓名 */
  personName: string;
  /** 寬度（px）；高度依比例約 0.48 */
  size?: number;
  className?: string;
  /** @deprecated 圓戳時代欄位；矩形戳章不再使用 */
  schoolName?: string;
  /** @deprecated 改以 titleLabel 呈現 */
  actionLabel?: string;
  dateLabel?: string;
  stampedAt?: string;
};

/**
 * 長方紅框電子戳章（仿實物原子章）
 * 左上處室、左下職稱／動作、右側姓名
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  officeLabel,
  titleLabel,
  personName,
  actionLabel,
  size = 160,
  className = '',
}) => {
  const office = (officeLabel || '').trim() || '—';
  const title = (titleLabel || actionLabel || '').trim().replace(/^已/, '') || '—';
  const name = (personName || '').trim() || '—';

  // 依姓名字數微調右側字級
  const nameLen = [...name].length;
  const nameFont = nameLen <= 2 ? 36 : nameLen === 3 ? 32 : nameLen === 4 ? 26 : 22;
  const officeFont = [...office].length >= 4 ? 22 : 26;
  const titleFont = 24;
  const height = size * 0.48;

  return (
    <div
      className={className}
      style={{ width: size, height }}
      aria-hidden
      title={`${office} ${title} ${name}`}
    >
      <svg
        viewBox="0 0 240 115"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        width="100%"
        height="100%"
      >
        {/* 外框 */}
        <rect
          x="4"
          y="4"
          width="232"
          height="107"
          fill="none"
          stroke={STAMP_RED}
          strokeWidth="3.2"
          rx="1"
        />
        {/* 中央分隔線（虛線感可選；實物多半無線，改以留白分欄） */}

        {/* 左上：處室 */}
        <text
          x="72"
          y="42"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={officeFont}
          letterSpacing="0.12em"
        >
          {office}
        </text>

        {/* 左下：職稱／動作 */}
        <text
          x="72"
          y="82"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={titleFont}
          letterSpacing="0.2em"
        >
          {title}
        </text>

        {/* 右側：姓名（跨兩列高度置中） */}
        <text
          x="168"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={nameFont}
          letterSpacing="0.08em"
        >
          {name}
        </text>
      </svg>
    </div>
  );
};
