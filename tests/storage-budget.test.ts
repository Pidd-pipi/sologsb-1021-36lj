import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDictionaryStore } from '~/store/dictionary';
import { STORAGE_BUDGET_BYTES, STORAGE_KEY, estimateBytes } from '~/utils/storage';
import type { DictionarySnapshot, VersionRecord } from '~/types/dictionary';

const bigText = (kb: number) => '语'.repeat(kb * 1024);

const makeVersion = (overrides: Partial<VersionRecord> = {}): VersionRecord => ({
  id: `version-${Math.random().toString(36).slice(2, 9)}`,
  at: new Date().toISOString(),
  action: '测试',
  detail: '测试版本',
  before: [],
  ...overrides
});

describe('存储预算与提交事务', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('estimateBytes 按 UTF-8 字节数估算体积', () => {
    expect(estimateBytes('')).toBe(2); // JSON.stringify('') === '""'
    expect(estimateBytes('语')).toBe(5); // 2 个引号 + 3 字节
    expect(estimateBytes({ a: 1 })).toBe(7);
  });

  it('正常提交后版本记录包含 revision 与 pinned 字段', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();
    const before = store.versions.length;
    store.createEntry();
    expect(store.versions.length).toBe(before + 1);
    const version = store.versions[0]!;
    expect(version.revision).toBe(1); // 提交前修订为 1
    expect(version.pinned).toBe(false);
  });

  it('固定版本后压缩存储会保留最早恢复点与已固定版本', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();

    // 制造一个较大的条目，使每个版本快照都占用可观空间
    store.createEntry();
    const entry = store.entries[0]!;
    store.updateField(entry.id, 'definition', bigText(300), 'definition'); // 约 900KB
    // 手动追加 10 个版本，每个都携带完整条目快照，使整份快照超过预算
    for (let i = 0; i < 10; i++) {
      store.versions.push(makeVersion({ before: JSON.parse(JSON.stringify(store.entries)) }));
    }
    const pinned = store.versions[4]!;
    store.pinVersion(pinned.id);
    // versions 按追加顺序排列，最后一条即最早恢复点
    const earliest = store.versions[store.versions.length - 1]!;

    const evicted = store.compressStorage();
    expect(evicted).toBeGreaterThan(0);
    // 最早恢复点与固定版本必须保留
    expect(store.versions.some((v) => v.id === earliest.id)).toBe(true);
    expect(store.versions.some((v) => v.id === pinned.id)).toBe(true);
    // 未固定版本被丢弃
    expect(store.versions.length).toBeLessThan(10);
    expect(estimateBytes(store.persistableSnapshot)).toBeLessThanOrEqual(STORAGE_BUDGET_BYTES);
  });

  it('腾不出空间时整笔撤回，保留草稿与重试入口', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();

    // 手动插入一个受保护的超大固定版本（超过预算），使压缩无法腾出空间
    const huge = bigText(5000); // 约 15MB UTF-8
    store.versions.unshift(makeVersion({
      id: 'pinned-huge',
      pinned: true,
      before: [{
        id: 'huge-entry', headword: 'huge', pronunciation: '', partOfSpeech: '', definition: huge,
        dialectVariants: [], examples: [], sources: [], synonyms: [], status: 'draft',
        notes: '', createdAt: '', updatedAt: '', reviewerComments: []
      }]
    }));

    const entriesBefore = JSON.stringify(store.entries);
    const revisionBefore = store.revision;
    const result = store.createEntry();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quota');
    // 整笔撤回：词条与修订号不变
    expect(JSON.stringify(store.entries)).toBe(entriesBefore);
    expect(store.revision).toBe(revisionBefore);
    // 草稿与重试入口保留
    expect(store.failedCommit).not.toBeNull();
    expect(store.failedCommit?.action).toBe('新建词条');
    expect(store.lastError?.type).toBe('quota');
  });

  it('重试入口重新提交成功后清除失败状态', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();

    // 制造一次失败：受保护的超大固定版本
    store.versions.unshift(makeVersion({
      id: 'pinned-huge', pinned: true,
      before: [{
        id: 'huge-entry', headword: 'huge', pronunciation: '', partOfSpeech: '',
        definition: bigText(5000), dialectVariants: [], examples: [], sources: [],
        synonyms: [], status: 'draft', notes: '', createdAt: '', updatedAt: '', reviewerComments: []
      }]
    }));
    const failResult = store.createEntry();
    expect(failResult.ok).toBe(false);
    expect(store.failedCommit).not.toBeNull();

    // 移除受保护的超大版本后，重试应成功
    store.versions.splice(store.versions.findIndex((v) => v.id === 'pinned-huge'), 1);
    store.retryFailedCommit();
    expect(store.failedCommit).toBeNull();
    expect(store.lastError).toBeNull();
  });

  it('跨标签页：存储修订号更高时拒绝提交，避免覆盖新修订', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();
    expect(store.lastSeenRevision).toBe(1);

    // 模拟另一标签页写入了更高修订号
    const incoming: DictionarySnapshot = {
      revision: 8, entries: store.entries, versions: store.versions, audit: store.audit
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));

    const result = store.createEntry();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
    expect(store.conflictRevision).toBe(8);
    // 本地状态未被改写
    expect(store.revision).toBe(1);
  });

  it('重新载入后清除冲突并允许提交', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();

    const incoming: DictionarySnapshot = {
      revision: 8, entries: store.entries, versions: store.versions, audit: store.audit
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
    const conflict = store.createEntry();
    expect(conflict.reason).toBe('conflict');

    store.reloadFromStorage();
    expect(store.conflictRevision).toBeNull();
    expect(store.revision).toBe(8);
    expect(store.lastSeenRevision).toBe(8);

    const retry = store.createEntry();
    expect(retry.ok).toBe(true);
  });

  it('压缩后重算撤销重做：被丢弃版本对应的快照被清理', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();

    // 用较小的条目制造版本，使压缩后仍有部分版本保留
    for (let i = 0; i < 30; i++) {
      store.createEntry();
      store.updateField(store.entries[0]!.id, 'definition', bigText(5), 'definition');
    }
    // 固定一个仍存在的早期版本
    const pinned = store.versions[Math.min(10, store.versions.length - 1)]!;
    store.pinVersion(pinned.id);

    store.compressStorage();
    // 撤销栈中的修订号都应能在时间线中找到
    const retained = new Set(store.versions.map((v) => v.revision));
    // 连续撤销不应出现悬空状态
    let guard = 0;
    while (store.canUndo && guard < 100) {
      store.undo();
      guard++;
      // 撤销后的修订号应在保留集合中（初始状态除外）
      if (store.revision > 1) {
        expect(retained.has(store.revision)).toBe(true);
      }
    }
    expect(guard).toBeGreaterThan(0);
  });

  it('写入配额失败时 persistSnapshot 返回 quota 错误', () => {
    const store = useDictionaryStore();
    store.hydrateFromBrowser();
    // 模拟 setItem 抛出配额错误
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      const err = new DOMException('quota', 'QuotaExceededError');
      throw err;
    };
    const result = store.persistSnapshot(store.persistableSnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('quota');
    Storage.prototype.setItem = original;
  });
});
