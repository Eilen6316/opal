/**
 * Shared review-bookkeeping primitives, extracted from App.tsx as part of the god-file
 * decomposition. Used by both the App orchestration logic and the ReviewBox component.
 */

/** Acceptance bookkeeping key: unique across turns (LLMs habitually reuse e0/e1, so a bare
 *  editId collides). Isomorphic with the Word-side DOM id. */
export const akey = (csId: string, editId: string): string => csId + '::' + editId;

/** Does a plan declare batching (the serial continuation protocol for long outputs)? */
export const BATCH_RX = /先做|第一批|前\s*\d+\s*[项处条个批]|下一批|分批|其余|剩余/;

/** Cap on consecutive auto-continued batches (guards against a plan that never stops saying
 *  "next batch"). */
export const AUTO_BATCH_CAP = 5;
