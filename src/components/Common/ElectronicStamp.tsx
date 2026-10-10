import React from 'react';
import { clipSchoolName, DEFAULT_SCHOOL_NAME } from '../../utils/schoolName';
import { formatStampRocDate } from '../../utils/noticeDocument';

const STAMP_BLUE = '#2a4f9c';
const STAMP_KAI =
  '"DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif';
const STAMP_DATE_FONT = 'Arial, "Helvetica Neue", "Noto Sans TC", sans-serif';

const CX = 100;
const CY = 102;
const R = 93;
const LINE_OFFSET = 18;
const ARC_FONT_SIZE = 22;
const ARC_RADIUS = 75;
const OFFICE_FONT_SIZE = 22;
const DATE_FONT_SIZE = 20;
const ACTION_FONT_SIZE = 22;

function circleChord(y: number) {
  const dy = y - CY;
  const half = Math.sqrt(Math.max(0, R * R - dy * dy));
  return { x1: CX - half, x2: CX + half };
}

function ArcSchoolName({ text, radius, fontSize }: { text: string; radius: number; fontSize: number }) {
  const chars = [...text];
  const startDeg = 152;
  const endDeg = 28;
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

type ElectronicStampProps = {
  schoolName: string;
  /** 中間處室／角色，如 生輔組、校長 */
  officeLabel: string;
  /** 底部動作，如 已會畢、已閱畢、校長核章 */
  actionLabel: string;
  dateLabel?: string;
  stampedAt?: string;
  size?: number;
  className?: string;
};

/**
 * 通用圓形電子戳章（巡堂會辦／核章）
 * 上弧校名 → 處室 → 日期 → 動作
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  schoolName,
  officeLabel,
  actionLabel,
  dateLabel,
  stampedAt,
  size = 96,
  className = '',
}) => {
  const label = clipSchoolName(schoolName) || DEFAULT_SCHOOL_NAME;
  const date =
    dateLabel ||
    formatStampRocDate(stampedAt ? new Date(stampedAt) : new Date());
  const lineTop = CY - LINE_OFFSET;
  const lineBottom = CY + LINE_OFFSET;
  const topChord = circleChord(lineTop);
  const bottomChord = circleChord(lineBottom);

  return (
    <div className={className} style={{ width: size, height: size * 1.025 }} aria-hidden>
      <svg viewBox="0 0 200 205" xmlns="http://www.w3.org/2000/svg" role="img" width="100%" height="100%">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={STAMP_BLUE} strokeWidth="2" />
        <ArcSchoolName text={label} radius={ARC_RADIUS} fontSize={ARC_FONT_SIZE} />
        <text
          x={CX}
          y={70}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize={OFFICE_FONT_SIZE}
        >
          {officeLabel}
        </text>
        <line
          x1={topChord.x1}
          y1={lineTop}
          x2={topChord.x2}
          y2={lineTop}
          stroke={STAMP_BLUE}
          strokeWidth="1.6"
        />
        <line
          x1={bottomChord.x1}
          y1={lineBottom}
          x2={bottomChord.x2}
          y2={lineBottom}
          stroke={STAMP_BLUE}
          strokeWidth="1.6"
        />
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_DATE_FONT}
          fontSize={DATE_FONT_SIZE}
          letterSpacing="0.08em"
        >
          {date}
        </text>
        <text
          x={CX}
          y={(lineBottom + CY + R) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_BLUE}
          fontFamily={STAMP_KAI}
          fontSize={ACTION_FONT_SIZE}
          letterSpacing="0.05em"
        >
          {actionLabel}
        </text>
      </svg>
    </div>
  );
};
