/**
 * OtterPatchEvent — headless JSON event stream. Each stage of propose → diff → commit emits one
 * structured event for streaming consumption by MCP servers / CLI / remote hosts (can be
 * JSON.stringify'd line by line).
 */
import type { OtterPatchDiff } from './diff.js';

export type OtterPatchEvent =
  | { type: 'propose:start'; format: string; intent: string }
  | { type: 'propose:done'; changeSetId: string; editCount: number; planSummary?: string }
  | { type: 'diff:done'; diff: OtterPatchDiff }
  | { type: 'commit:start'; format: string; strategy: string; editCount: number }
  | { type: 'commit:done'; ok: boolean; touchedParts: string[]; fidelity: number; bytes: number }
  | { type: 'error'; stage: 'propose' | 'diff' | 'commit'; message: string };

export type OtterPatchEventListener = (e: OtterPatchEvent) => void;
