import React from 'react';

const STAMP_BLUE = '#2a4f9c';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif';
const STAMP_DATE_FONT = 'Arial, "Helvetica Neue", "Noto Sans TC", sans-serif';

const CX = 100;
const CY = 102;
const R = 93;

/** 上弧校名：半徑略小讓字帶下移，緊貼上緣內弧 */
const ARC_FONT_SIZE = 24;
const ARC_RADIUS = 77;

const OFFICE_FONT_SIZE = 24;
const DATE_FONT_SIZE = 20;
const NOTICE_FONT_SIZE = 24;

function circleChord(y: number) {
  const dy = y - CY;
  const half = Math.sqrt(Math.max(0, R * R - dy * dy));
  return { x1: CX - half, x2: CX + half };
}

/** 沿圓頂排字（避免 textPath 上下顛倒） */
function ArcSchoolName({ text, radius, fontSize }: { text: string; radius: number; fontSize: number }) {
  const chars = [...text];
  /** 縮小弧度跨度，校名緊密貼成上弧 */
  const startDeg = 148;
  const endDeg = 32;
  const span = startDeg - endDeg;

  return (
    <>
      {chars.map((ch, i) => {
        const t = chars.length === 1 ? 0.5 : i / (chars.length - 1);
        const deg = startDeg - t * span;
        const rad = (deg * Math.PI) / 180;
        const x = CX + radius * Math.cos(rad);
        const y = CY - radius * Math.sin(rad);
        const rotate = 90 - deg;
        return (
          <text
            key={`${ch}-${i}`}
            x={x}
            y={y}
            fill={STAMP_BLUE}
            fontFamily={STAMP_KAI}
            fontSize={fontSize}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${rotate}, ${x}, ${y})`}
          >
            {ch}
          </text>
        );
      })}
    </>
  );
}

const STAMP_SCHOOL_NAME = '高雄市立中正高工';

type NoticePageStampProps = {
  dateLabel: string;
};

/**
 * 圓形教務戳章（SVG）
 * 版面：上弧校名 → 教務處 → 橫線 → 日期 → 橫線 → 派代通知單
 */
export const NoticePageStamp: React.FC<NoticePageStampProps> = ({ dateLabel }) => {
  const label = STAMP_SCHOOL_NAME;

  const lineTop = 88;
  const lineBottom = 124;
  const topChord = circleChord(lineTop);
  const bottomChord = circleChord(lineBottom);

  return (
    <div className="substitute-notice-page-stamp" aria-hidden>
      <svg
        className="substitute-notice-page-stamp-svg"
        viewBox="0 0 200 205"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={STAMP_BLUE} strokeWidth="2.2" />

        <ArcSchoolName text={label} radius={ARC_RADIUS} fontSize={ARC_FONT_SIZE} />

        <text
          x={CX}
          y={80}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize={OFFICE_FONT_SIZE}
        >
          教務處
        </text>

        <line
          x1={topChord.x1}
          y1={lineTop}
          x2={topChord.x2}
          y2={lineTop}
          stroke={STAMP_BLUE}
          strokeWidth="1.8"
        />
        <line
          x1={bottomChord.x1}
          y1={lineBottom}
          x2={bottomChord.x2}
          y2={lineBottom}
          stroke={STAMP_BLUE}
          strokeWidth="1.8"
        />

        <text
          x={CX}
          y={106}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_DATE_FONT}
          fontSize={DATE_FONT_SIZE}
          letterSpacing="0.06em"
        >
          {dateLabel}
        </text>

        <text
          x={CX}
          y={153}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize={NOTICE_FONT_SIZE}
          letterSpacing="0.06em"
        >
          派代通知單
        </text>
      </svg>
    </div>
  );
};
