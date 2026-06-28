/**
 * 真实 Univer 电子表格实例(替换 Excel 渲染区的 mock 网格)。
 * Univer 提供原生表格引擎(单元格/公式/选区/样式),OPAL 作为其上的"可审阅 Agent 层"。
 * 由 App 用 lazy() 懒加载,Univer 体积大 → 代码分割,仅切到 Excel 时拉取。
 */
import { useEffect, useRef } from 'react';
import { createUniver, defaultTheme, LocaleType, merge } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import '@univerjs/preset-sheets-core/lib/index.css';

const HEADERS = ['日期', '产品', '销量', '单价', '金额', '毛利率'];
const DATA: (string | number)[][] = [
  ['01-03', 'A型', 120, 38, '=C2*D2', '41%'],
  ['01-05', 'B型', 86, 52, '=C3*D3', '37%'],
  ['01-09', 'A型', 1500, 38, '=C4*D4', '41%'],
  ['01-12', 'C型', 64, 70, '=C5*D5', '28%'],
  ['01-15', 'B型', 92, 52, '=C6*D6', '37%'],
];

export default function UniverSheet() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ZH_CN,
      locales: { [LocaleType.ZH_CN]: merge({}, sheetsZhCN) },
      theme: defaultTheme,
      presets: [UniverSheetsCorePreset({ container: ref.current })],
    });
    univerAPI.createWorkbook({ name: '月度销售表' });

    // 用 Facade API 填入演示数据(失败不影响空白真实表格)
    try {
      const sheet = univerAPI.getActiveWorkbook()?.getActiveSheet();
      if (sheet) {
        HEADERS.forEach((h, c) => sheet.getRange(0, c).setValue(h));
        DATA.forEach((row, r) => row.forEach((v, c) => sheet.getRange(r + 1, c).setValue(v as never)));
      }
    } catch {
      /* 演示数据可选 */
    }

    return () => univer.dispose();
  }, []);
  return <div className="univer-host" ref={ref} />;
}
