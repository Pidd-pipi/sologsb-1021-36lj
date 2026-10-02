import type { DictionarySnapshot } from '~/types/dictionary';

export const STORAGE_KEY = 'sologsb-1021-dictionary-v1';

// 存储预算：浏览器 localStorage 通常为 5MB，预留约 1MB 头部空间，
// 避免触达浏览器硬配额后整笔写入失败。
export const STORAGE_BUDGET_BYTES = 4 * 1024 * 1024;

export type WriteResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'quota' | 'conflict' | 'error'; message: string };

/** 按 UTF-8 字节数估算快照体积，比字符串长度更贴近真实配额。 */
export function estimateBytes(value: unknown): number {
  const text = JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength;
}

export function readStoredSnapshot(): DictionarySnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DictionarySnapshot;
  } catch {
    return null;
  }
}

export function writeStoredSnapshot(snapshot: DictionarySnapshot): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return { ok: true, revision: snapshot.revision };
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      return { ok: false, reason: 'quota', message: '浏览器本地存储容量不足' };
    }
    return { ok: false, reason: 'error', message: '写入本地存储失败' };
  }
}

export function clearStoredSnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略清理失败 */
  }
}
