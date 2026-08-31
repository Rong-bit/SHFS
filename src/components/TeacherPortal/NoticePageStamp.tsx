import React, { useId } from 'react';

const STAMP_BLUE = '#2a4f9c';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif';
const STAMP_DATE = 'Arial, "Helvetica Neue", "Noto Sans TC", sans-serif';

const CX = 100;
const CY = 102;
const R = 93;

function arcFontSize(len: number): number {
  if (len <= 8) return 13.5;
  if (len <= 10) return 12;
  if (len <= 12) return 10.5;
  if (len <= 14) return 9.2;
  return 8.2;
}

/** 圓內水平弦端點 */
function circleChord(y: number) {
  const dy = y - CY;
  const half = Math.sqrt(Math.max(0, R * R - dy * dy));
  return { x1: CX - half, x2: CX + half };
}

type NoticePageStampProps = {
  schoolName: string;
  dateLabel: string;
};

/**
 * 圓形教務戳章（SVG）
 * 版面：上弧校名 → 教務處 → 橫線 → 日期 → 橫線 → 派代通知單
 */
export const NoticePageStamp: React.FC<NoticePageStampProps> = ({ schoolName, dateLabel }) => {
  const arcId = useId().replace(/:/g, '');
  const label = schoolName.trim() || '學校';

  // 上弧：sweep=0 才會沿圓頂（sweep=1 會翻到圓底，校名會消失）
  const arcY = 86;
  const arcHalf = Math.sqrt(Math.max(0, R * R - (arcY - CY) ** 2)) - 1;
  const arcPath = `M ${CX - arcHalf} ${arcY} A ${R} ${R} 0 0 0 ${CX + arcHalf} ${arcY}`;

  const lineTop = 92;
  const lineBottom = 126;
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
        <defs>
          <path id={arcId} d={arcPath} fill="none" />
          <clipPath id={`${arcId}-clip`}>
            <circle cx={CX} cy={CY} r={R - 0.5} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${arcId}-clip)`}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={STAMP_BLUE} strokeWidth="2.2" />

          <text fill={STAMP_BLUE} fontFamily={STAMP_KAI} fontSize={arcFontSize(label.length)}>
            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
              {label}
            </textPath>
          </text>

          <text
            x={CX}
            y={80}
            textAnchor="middle"
            fill={STAMP_BLUE}
            fontFamily={STAMP_KAI}
            fontSize="15.5"
          >
            教務處
          </text>

          <line
            x1={topChord.x1}
            y1={lineTop}
            x2={topChord.x2}
            y2={lineTop}
            stroke={STAMP_BLUE}
            strokeWidth="1.7"
          />
          <line
            x1={bottomChord.x1}
            y1={lineBottom}
            x2={bottomChord.x2}
            y2={lineBottom}
            stroke={STAMP_BLUE}
            strokeWidth="1.7"
          />

          <text
            x={CX}
            y={110}
            textAnchor="middle"
            fill={STAMP_BLUE}
            fontFamily={STAMP_DATE}
            fontSize="17.5"
            letterSpacing="0.08em"
          >
            {dateLabel}
          </text>

          <text
            x={CX}
            y={150}
            textAnchor="middle"
            fill={STAMP_BLUE}
            fontFamily={STAMP_KAI}
            fontSize="15.5"
            letterSpacing="0.1em"
          >
            派代通知單
          </text>
        </g>
      </svg>
    </div>
  );
};
