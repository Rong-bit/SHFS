import React, { useId, useMemo } from 'react';

const STAMP_BLUE = '#2d4f9c';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif';
const STAMP_DATE =
  '"Arial Narrow", "Helvetica Neue", Arial, "Noto Sans TC", sans-serif';

const CX = 100;
const CY = 102;
const R = 93;

function arcMetrics(schoolName: string) {
  const len = schoolName.length;
  if (len <= 8) return { fontSize: 14.5, pathY: 66, textLength: 168 };
  if (len <= 10) return { fontSize: 12.5, pathY: 64, textLength: 172 };
  if (len <= 12) return { fontSize: 11, pathY: 62, textLength: 176 };
  if (len <= 14) return { fontSize: 9.5, pathY: 60, textLength: 180 };
  return { fontSize: 8.5, pathY: 58, textLength: 184 };
}

/** 圓內水平弦端點（橫線貼近圓邊） */
function circleChord(y: number, inset = 3) {
  const dy = y - CY;
  const half = Math.sqrt(Math.max(0, R * R - dy * dy));
  return { x1: CX - half + inset, x2: CX + half - inset };
}

type NoticePageStampProps = {
  schoolName: string;
  dateLabel: string;
};

/** 圓形教務戳章（SVG 動態生成，版面對齊實體印鑑） */
export const NoticePageStamp: React.FC<NoticePageStampProps> = ({ schoolName, dateLabel }) => {
  const arcId = useId().replace(/:/g, '');
  const label = schoolName.trim() || '學校';
  const arc = useMemo(() => arcMetrics(label), [label]);
  const arcPath = `M 18 ${arc.pathY} A 82 82 0 0 1 182 ${arc.pathY}`;

  const lineTop = 90;
  const lineBottom = 130;
  const topChord = circleChord(lineTop);
  const bottomChord = circleChord(lineBottom);
  const dateY = (lineTop + lineBottom) / 2 + 5;
  const officeY = lineTop - 11;
  const noticeY = lineBottom + 21;

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
        </defs>

        <circle cx={CX} cy={CY} r={R} fill="none" stroke={STAMP_BLUE} strokeWidth="2.6" />

        <text fill={STAMP_BLUE} fontFamily={STAMP_KAI} fontSize={arc.fontSize} fontWeight="600">
          <textPath
            href={`#${arcId}`}
            startOffset="50%"
            textAnchor="middle"
            textLength={arc.textLength}
            lengthAdjust="spacingAndGlyphs"
          >
            {label}
          </textPath>
        </text>

        <text
          x={CX}
          y={officeY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize="16.5"
          fontWeight="600"
        >
          教務處
        </text>

        {/* 上、下兩條橫線：分隔上／中／下三區 */}
        <line
          x1={topChord.x1}
          y1={lineTop}
          x2={topChord.x2}
          y2={lineTop}
          stroke={STAMP_BLUE}
          strokeWidth="2.4"
          strokeLinecap="square"
        />
        <line
          x1={bottomChord.x1}
          y1={lineBottom}
          x2={bottomChord.x2}
          y2={lineBottom}
          stroke={STAMP_BLUE}
          strokeWidth="2.4"
          strokeLinecap="square"
        />

        <text
          x={CX}
          y={dateY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_DATE}
          fontSize="19"
          fontWeight="600"
          letterSpacing="0.1em"
        >
          {dateLabel}
        </text>

        <text
          x={CX}
          y={noticeY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize="16.5"
          fontWeight="600"
          letterSpacing="0.12em"
        >
          派代通知單
        </text>
      </svg>
    </div>
  );
};
