import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchSectPr } from './sect.js';

const DOC = '<w:document><w:body><w:p><w:r><w:t>正文</w:t></w:r></w:p>'
  + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'
  + '</w:body></w:document>';

test('sectPr:双栏 → 插入 cols(pgMar 之后),其余零触碰', () => {
  const r = patchSectPr(DOC, { columns: 2 });
  assert.equal(r.changed, true);
  assert.match(r.xml, /<w:pgMar[^>]*\/><w:cols w:num="2" w:space="425" w:equalWidth="1"\/>/);
  assert.match(r.xml, /<w:t>正文<\/w:t>/); // 正文不动
});

test('sectPr:恢复单栏 → cols 去掉 num', () => {
  const two = patchSectPr(DOC, { columns: 2 }).xml;
  const r = patchSectPr(two, { columns: 1 });
  assert.equal(r.changed, true);
  assert.ok(!/<w:cols[^>]*w:num=/.test(r.xml));
});

test('sectPr:窄边距 → pgMar 四边替换,header/footer/gutter 保留', () => {
  const r = patchSectPr(DOC, { margin: 'narrow' });
  assert.match(r.xml, /w:top="720"/);
  assert.match(r.xml, /w:left="720"/);
  assert.match(r.xml, /w:header="851"/); // 原值保留
});

test('sectPr:横向 → orient=landscape 且宽高交换', () => {
  const r = patchSectPr(DOC, { orient: 'landscape' });
  assert.match(r.xml, /w:orient="landscape"/);
  assert.match(r.xml, /<w:pgSz[^>]*w:w="16838"/);
  assert.match(r.xml, /<w:pgSz[^>]*w:h="11906"/);
});

test('sectPr:组合补丁(双栏+窄边距+横向)一次落齐', () => {
  const r = patchSectPr(DOC, { columns: 2, margin: 'narrow', orient: 'landscape' });
  assert.match(r.xml, /w:num="2"/);
  assert.match(r.xml, /w:top="720"/);
  assert.match(r.xml, /w:orient="landscape"/);
});

test('sectPr:无 sectPr 的文档 → body 末尾补建最小节属性', () => {
  const bare = '<w:document><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>';
  const r = patchSectPr(bare, { columns: 2 });
  assert.equal(r.changed, true);
  assert.match(r.xml, /<w:sectPr>[\s\S]*w:num="2"[\s\S]*<\/w:sectPr><\/w:body>/);
});

test('sectPr:空补丁 → 不变', () => {
  const r = patchSectPr(DOC, {});
  assert.equal(r.changed, false);
  assert.equal(r.xml, DOC);
});
