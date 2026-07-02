/**
 * TopBar — brand, workspace format tabs, current file name and language picker.
 * Extracted from App.tsx (decomposition phase 3); render + callbacks only.
 */
import type { ReactNode } from 'react';
import { useT, LANGS, type Lang } from './i18n.js';
import { IconDots } from './icons.js';

export interface TopBarFormat { id: string; label: string; file: string }

export interface TopBarProps {
  formats: readonly TopBarFormat[];
  fmt: string;
  fileLabel: string;
  lang: Lang;
  onPickFormat(id: string): void;
  onPickLang(l: Lang): void;
}

export function TopBar(p: TopBarProps): ReactNode {
  const t = useT();
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/logo.png" alt="OtterPatch" />
        <span className="sub">{t('safe-commit layer')}</span>
      </div>
      <div className="fmttabs">
        {p.formats.map((f) => (
          <button key={f.id} className={'fmttab' + (f.id === p.fmt ? ' on' : '')} onClick={() => p.onPickFormat(f.id)}>
            {t(f.label)}
          </button>
        ))}
      </div>
      <div className="file">
        <span className="name">{t(p.fileLabel)}</span>
        <span className="saved">{t('已保存')}</span>
      </div>
      <div className="grow" />
      <select className="langsel" value={p.lang} onChange={(e) => p.onPickLang(e.target.value as Lang)} title="Language">
        {LANGS.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
      <button className="icon-ghost" title={t('更多')}><IconDots size={18} /></button>
    </header>
  );
}
