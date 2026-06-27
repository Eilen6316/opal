import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redlineDocumentXml } from './document.js';

const DOC =
  '<w:document><w:body>' +
  '<w:p><w:pPr><w:pStyle w:val="a"/></w:pPr><w:r><w:t>利润是 100 元</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>合计 50</w:t></w:r></w:p>' +
  '</w:body></w:document>';

test('redlineDocumentXml: 命中段落改红线,保留 pPr,其它段不动', () => {
  const { xml, changed } = redlineDocumentXml(DOC, [{ old: '100', new: '200' }], { author: 'A', date: 'D' });
  assert.equal(changed, 1);
  assert.match(xml, /<w:del[^>]*><w:r><w:delText[^>]*>100<\/w:delText>/);
  assert.match(xml, /<w:ins[^>]*><w:r><w:t[^>]*>200<\/w:t>/);
  assert.match(xml, /<w:pPr><w:pStyle w:val="a"\/><\/w:pPr>/); // pPr 保留
  assert.match(xml, /<w:t>合计 50<\/w:t>/); // 另一段原样
});

test('redlineDocumentXml: 无命中 → 不改,changed=0', () => {
  const { xml, changed } = redlineDocumentXml(DOC, [{ old: '999', new: '1' }]);
  assert.equal(changed, 0);
  assert.equal(xml, DOC);
});

test('redlineDocumentXml: 多段命中各自红线,w:id 递增不冲突', () => {
  const { xml, changed } = redlineDocumentXml(DOC, [
    { old: '100', new: '200' },
    { old: '50', new: '60' },
  ]);
  assert.equal(changed, 2);
  const ids = [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(new Set(ids).size, ids.length); // 全不重复
});
