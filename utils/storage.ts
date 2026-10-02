import type { DictionaryEntry, StorageUsage, VersionRecord } from '~/types/dictionary';

/** localStorage 中无法直接拿到配额时的保守兜底（大多数浏览器单源上限约 5MB）。 */
export const FALLBACK_QUOTA = 5 * 1024 * 1024;
/** 估算配额时预留的安全垫：取固定值与配额 5% 的较小者，避免小配额下永远无法写入。 */
export const QUOTA_SAFETY_MARGIN = 128 * 1024;
const safetyMarginFor = (quota: number) => Math.min(QUOTA_SAFETY_MARGIN, Math.floor(quota * 0.05));
/** 最近保留的未固定完整快照数：撤销栈顶至少要有一步可退。 */
const PROTECT_RECENT = 1;
/** 压缩后单条版本的元数据占位，保证时间线条目不丢失。 */
const COMPACT_STUB: { before: DictionaryEntry[]; compacted: true } = { before: [], compacted: true };

export interface StorageEstimate {
  used: number;
  quota: number;
}

export const byteLength = (value: string) => {
  // UTF-16 之外的字符按代理对计 3 字节（localStorage 使用 UTF-16 存储，中文等 BMP 字符 2 字节）。
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0xffff) { bytes += 3; i += 1; } else if (code > 0x7f) bytes += 2; else bytes += 1;
  }
  return bytes;
};

export const serializedBytes = (value: unknown) => byteLength(JSON.stringify(value));

export async function estimateStorage(): Promise<StorageEstimate> {
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota > 0) {
      return { used: estimate.usage ?? 0, quota: estimate.quota };
    }
  }
  let localBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? '';
      localBytes += byteLength(key) + byteLength(value);
    }
  } catch {
    // 隐私模式等场景可能拒绝访问，退回固定配额估算。
  }
  return { used: localBytes, quota: FALLBACK_QUOTA };
}

export async function readUsage(mainKey: string): Promise<StorageUsage> {
  const { used, quota } = await estimateStorage();
  let mainBytes = 0;
  try {
    const raw = localStorage.getItem(mainKey);
    if (raw) mainBytes = byteLength(raw);
  } catch { /* 忽略 */ }
  const headroom = Math.max(0, quota - used - safetyMarginFor(quota));
  return { used, quota, headroom, ratio: quota > 0 ? used / quota : 0, mainBytes };
}

export interface CompactResult {
  versions: VersionRecord[];
  /** 是否丢弃过至少一个未固定快照。 */
  changed: boolean;
  /** 被压缩掉的版本 id。 */
  dropped: string[];
  /** 仅压缩可丢弃集合是否足以腾出目标空间；false 时调用方必须拒绝写入。 */
  sufficient: boolean;
}

/**
 * 按存储预算压缩版本时间线（versions 新到旧）：
 * - 时间线（id / 时间 / 动作 / 详情 / 固定标记）全部保留，只丢弃 before；
 * - pinned 关键版本、最早恢复点（最旧未固定完整快照）、撤销栈顶（最新未固定完整快照）
 *   永远保留完整快照，任何压力下都不会被动用；
 * - 中间的未固定旧快照按“最旧优先”依次压缩，直到腾出目标字节数；
 * - 可丢弃集合用尽仍达不到目标时，sufficient=false，调用方必须整笔拒绝。
 * savedBytes 以压缩前后序列化字节的真实差值计算，不虚报。
 */
export function compactVersions(
  versions: VersionRecord[],
  targetSaving: number
): CompactResult & { savedBytes: number; sufficient: boolean } {
  const insufficient = { versions, changed: false, dropped: [], savedBytes: 0, sufficient: targetSaving <= 0 };
  if (targetSaving <= 0) return insufficient;

  // 最旧的未固定完整快照 = 最早恢复点。
  let earliestIndex = -1;
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    if (!versions[i].pinned && versions[i].before.length) { earliestIndex = i; break; }
  }
  // 最新的若干条未固定完整快照 = 撤销栈顶保护。
  const protectedRecent = new Set<number>();
  for (let i = 0, kept = 0; i < versions.length && kept < PROTECT_RECENT; i += 1) {
    if (!versions[i].pinned && versions[i].before.length) { protectedRecent.add(i); kept += 1; }
  }

  // 可压缩集合：未固定、非最早恢复点、非撤销栈顶的中间旧快照（最旧优先）。
  const plan = versions
    .map((record, index) => ({ record, index }))
    .filter(({ record, index }) =>
      record.before.length && !record.pinned && index !== earliestIndex && !protectedRecent.has(index)
    )
    .sort((a, b) => b.index - a.index); // 索引越大越旧，越旧越先丢弃

  const originalBytes = serializedBytes(versions);
  const next = versions.map((record) => ({ ...record }));
  const dropped: string[] = [];
  for (const { record, index } of plan) {
    const candidateBytes = serializedBytes(next.map((item, i) => (i === index ? { ...record, ...COMPACT_STUB } : item)));
    const wouldSave = originalBytes - candidateBytes;
    next[index] = { ...record, ...COMPACT_STUB };
    dropped.push(record.id);
    if (wouldSave >= targetSaving) break;
  }

  const savedBytes = originalBytes - serializedBytes(next);
  return { versions: next, changed: dropped.length > 0, dropped, savedBytes, sufficient: savedBytes >= targetSaving };
}

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.max(0, Math.round(bytes))} B`;
};
