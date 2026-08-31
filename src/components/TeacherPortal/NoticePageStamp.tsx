import React, { useId } from 'react';

const STAMP_BLUE = '#2a4f9c';
const STAMP_FONT =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif';

function arcFontSize(schoolName: string): number {
  const len = schoolName.length;
  if (len <= 8) return 15;
  if (len <= 10) return 13;
  if (len <= 12) return 11.5;
  return 10;
}

type NoticePageStampProps = {
  schoolName: string;
  dateLabel: string;
};

/** 圓形教務戳章（SVG 動態生成，取代固定 PNG） */
export const NoticePageStamp: React.FC<NoticePageStampProps> = ({ schoolName, dateLabel }) => {
  const arcId = useId().replace(/:/g, '');
  const label = schoolName.trim() || '學校';
  const arcSize = arcFontSize(label);

  return (
    <div className="substitute-notice-page-stamp" aria-hidden>
      <svg
        className="substitute-notice-page-stamp-svg"
        viewBox="0 0 200 205"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        <defs>
          <path id={arcId} d="M 28 82 A 72 72 0 0 1 172 82" fill="none" />
          <filter id={`${arcId}-grain`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.35" />
          </filter>
        </defs>

        <circle
          cx="100"
          cy="102"
          r="94"
          fill="none"
          stroke={STAMP_BLUE}
          strokeWidth="2.2"
          filter={`url(#${arcId}-grain)`}
        />

        <text
          fill={STAMP_BLUE}
          fontFamily={STAMP_FONT}
          fontSize={arcSize}
          letterSpacing="0.02em"
          filter={`url(#${arcId}-grain)`}
        >
          <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {label}
          </textPath>
        </text>

        <text
          x="100"
          y="74"
          textAnchor="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_FONT}
          fontSize="17"
          filter={`url(#${arcId}-grain)`}
        >
          教務處
        </text>

        <line
          x1="22"
          y1="88"
          x2="178"
          y2="88"
          stroke={STAMP_BLUE}
          strokeWidth="1.6"
          filter={`url(#${arcId}-grain)`}
        />
        <line
          x1="22"
          y1="126"
          x2="178"
          y2="126"
          stroke={STAMP_BLUE}
          strokeWidth="1.6"
          filter={`url(#${arcId}-grain)`}
        />

        <text
          x="100"
          y="114"
          textAnchor="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_FONT}
          fontSize="17"
          letterSpacing="0.06em"
          filter={`url(#${arcId}-grain)`}
        >
          {dateLabel}
        </text>

        <text
          x="100"
          y="154"
          textAnchor="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_FONT}
          fontSize="17"
          letterSpacing="0.08em"
          filter={`url(#${arcId}-grain)`}
        >
          派代通知單
        </text>
      </svg>
    </div>
  );
};
