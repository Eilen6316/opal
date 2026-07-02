/**
 * pptx surgical patch compiler: applies replaceText edits from a ChangeSet (flow anchor:
 * path[0] = slide index, quote.text = original text) to <a:t> text in ppt/slides/slideN.xml,
 * rewriting only the slide parts that were hit and passing all other bytes through unchanged
 * (SurgicalOoxmlWriteback handles repacking + integrity self-check).
 * v1 limitation: target text must fall within a single <a:t> run (common for short titles/bullets);
 * text split across runs is not merged yet.
 */
import type { ChangeSet } from '@otterpatch/core';
import { readOoxmlParts, type OoxmlParts, type OoxmlPatchCompiler } from '@otterpatch/writeback-surgical';

const dec = new TextDecoder();
const enc = new TextEncoder();
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceInSlide(xml: string, oldText: string, neu: string): { xml: string; hit: boolean } {
  const eo = esc(oldText);
  const en = esc(neu);
  let hit = false;
  const out = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, txt: string) => {
    if (!hit && txt.includes(eo)) {
      hit = true;
      return `<a:t>${txt.replace(eo, en)}</a:t>`;
    }
    return m;
  });
  return { xml: out, hit };
}

/** pptx compiler for SurgicalOoxmlWriteback (same shape as buildXlsxCompiler). */
export function buildPptxCompiler(): OoxmlPatchCompiler {
  return async (cs: ChangeSet, original: Uint8Array): Promise<OoxmlParts> => {
    const parts = readOoxmlParts(original);
    const patches: OoxmlParts = {};
    for (const e of cs.edits) {
      if (e.op.kind !== 'replaceText') continue;
      const anchor = cs.anchors[e.target];
      if (!anchor || anchor.portable.kind !== 'flow') continue;
      const slideIdx = anchor.portable.path[0] ?? 0;
      const oldText = anchor.portable.quote.text;
      if (!oldText) continue;
      const path = `ppt/slides/slide${slideIdx + 1}.xml`;
      const src = patches[path] ?? parts[path];
      if (!src) continue;
      const { xml, hit } = replaceInSlide(dec.decode(src), oldText, e.op.text);
      if (hit) patches[path] = enc.encode(xml);
    }
    return patches;
  };
}
