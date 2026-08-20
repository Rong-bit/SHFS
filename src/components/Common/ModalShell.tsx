import React from 'react';

type ModalShellProps = {
  children: React.ReactNode;
  /** z-index，預設 z-50 */
  zClassName?: string;
  /** 遮罩背景 */
  backdropClassName?: string;
  /** 面板外觀（寬度、底色、圓角等） */
  panelClassName?: string;
  /**
   * panel：整塊面板可捲（表單類）
   * body：限制高度，由子層 flex-1 overflow-y-auto 捲動（有固定標題／底欄）
   * none：只修正外層置中裁切，不限制高度（列印預覽等）
   */
  scroll?: 'panel' | 'body' | 'none';
  maxHeightClassName?: string;
};

/**
 * 統一 Modal 外殼：避免 fixed + flex 垂直置中時，內容超出視窗卻捲不到頂／底。
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  children,
  zClassName = 'z-50',
  backdropClassName = 'bg-slate-950/70 backdrop-blur-xs',
  panelClassName = 'bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl',
  scroll = 'panel',
  maxHeightClassName = 'max-h-[min(92dvh,920px)]',
}) => {
  const panelScrollClass =
    scroll === 'panel'
      ? `${maxHeightClassName} overflow-y-auto overscroll-contain`
      : scroll === 'body'
        ? `${maxHeightClassName} overflow-hidden flex flex-col`
        : 'overflow-visible';

  return (
    <div className={`fixed inset-0 ${zClassName} overflow-y-auto ${backdropClassName}`}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-4 py-4 sm:py-6">
        <div className={`${panelClassName} ${panelScrollClass}`}>{children}</div>
      </div>
    </div>
  );
};
