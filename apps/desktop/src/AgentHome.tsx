/**
 * AgentHome — the empty-thread landing view in the agent rail: intro, quick-start prompts,
 * and recent intents. Extracted from App.tsx (god-file decomposition); stateless.
 */
import type { ReactNode } from 'react';
import { useT } from './i18n.js';
import { IconClock } from './icons.js';

const QUICKS: { t: string; kind: 'do' | 'ask'; prompt: string }[] = [
  { t: '补全缺失的计算列', kind: 'do', prompt: '检查并补齐缺失的计算列(如 金额=销量×单价、毛利率),用公式实现' },
  { t: '标红异常值', kind: 'do', prompt: '找出各数值列里偏离均值过大的异常值,标红并列出问题清单' },
  { t: '统一日期/数字格式', kind: 'do', prompt: '统一日期为 YYYY-MM-DD,把存成文本的数字转回数值,去除多余空格' },
  { t: '这张表有什么问题?', kind: 'ask', prompt: '通览整张表,指出数据质量问题(缺失、异常、格式不一致等),给出清单' },
  { t: '各产品销量合计?', kind: 'ask', prompt: '按产品分组,汇总每个产品的销量合计' },
];

export interface AgentHomeProps {
  recent: Array<{ t: string; time: string }>;
  /** Fire a quick-start prompt immediately. */
  onSend(prompt: string): void;
  /** Put a recent intent back into the composer without sending. */
  onPick(text: string): void;
}

export function AgentHome({ recent, onSend, onPick }: AgentHomeProps): ReactNode {
  const t = useT();
  return (
    <div className="agent-home">
      <div className="ai-intro">
        <img className="ai-mark" src="/favicon.png" alt="" />
        <div className="ai-title">{t('OtterPatch 表格助手')}</div>
        <div className="ai-sub">{t('圈选区域,问我问题或让我改表 —— 所有改动都先给你逐条审阅')}</div>
      </div>
      <div className="qs-label">{t('试试')}</div>
      <div className="qs-list">
        {QUICKS.map((q) => (
          <button key={q.t} className={'qs ' + q.kind} onClick={() => onSend(q.prompt)}>
            <span className="qs-tag">{q.kind === 'do' ? t('改') : t('问')}</span>
            <span className="qs-t">{t(q.t)}</span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="qs-label">{t('最近')}</div>
          <div className="recent-list">
            {recent.map((r, i) => (
              <button key={i} className="recent" onClick={() => onPick(r.t)} title={r.t}>
                <IconClock size={13} />
                <span className="rt">{r.t}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
