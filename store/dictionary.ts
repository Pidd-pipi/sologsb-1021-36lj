import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  AuditRecord, DictionaryEntry, DictionarySnapshot, DuplicatePair, EntryStatus,
  PendingConflict, PendingDraft, ReviewComment, SaveStatus, StorageUsage, VersionRecord
} from '~/types/dictionary';
import { findDuplicates } from '~/utils/dictionary';
import {
  compactVersions, readUsage, serializedBytes
} from '~/utils/storage';

const STORAGE_KEY = 'sologsb-1021-dictionary-v1';
const DRAFTS_KEY = 'sologsb-1021-pending-v1';
const PAYLOAD_FORMAT = 2;
const MAX_VERSIONS = 200;
const MAX_AUDIT = 300;

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const seedEntries = (): DictionaryEntry[] => [
  {
    id: 'entry-001', headword: 'ŋgɨ³³', pronunciation: 'ŋgɨ˧˧（低平调）', partOfSpeech: '名词', definition: '山间常年不涸的小水潭；也用来比喻安静而可靠的人。',
    dialectVariants: [
      { id: 'v-1', dialect: '北坡话', form: 'ŋgɨ³³ tsha⁵⁵', pronunciation: 'ŋgɨ tsha', note: '强调泉水源头' },
      { id: 'v-2', dialect: '河谷话', form: 'a³³ ŋgɨ³³', pronunciation: 'a ŋgɨ', note: '前缀形式' }
    ],
    examples: [
      { id: 'ex-1', text: 'a³³ ŋgɨ³³ ma³³ ʔmɨ⁵⁵.', translation: '这个小水潭是甜的。', source: '民间故事·寻找水源' },
      { id: 'ex-2', text: 'ŋgɨ³³ tɕi⁵⁵ dza³³.', translation: '山泉到了冬天也不会干。', source: '访谈录音 2018-04' }
    ],
    sources: [
      { id: 'src-1', title: '北坡方言词汇表', citation: '李某某记录，1987，手稿第 42 页', url: '' },
      { id: 'src-2', title: '嘎木村发音人访谈', citation: '录音 A-2018-04-17，00:12:31', url: '' }
    ],
    synonyms: ['水潭', '泉水'], status: 'confirmed', notes: '声调标音经两位发音人复核。', createdAt: '2024-08-11T04:00:00.000Z', updatedAt: '2025-03-09T06:12:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-002', headword: 'dʑa⁵⁵', pronunciation: 'dʑa˥（高平调）', partOfSpeech: '动词', definition: '把谷物摊开晾晒；引申为耐心等待事情成熟。',
    dialectVariants: [{ id: 'v-3', dialect: '东南村话', form: 'dʑa⁵⁵ ka³³', pronunciation: 'dʑa ka', note: '带结果补语 habitual 形式' }],
    examples: [{ id: 'ex-3', text: 'kho⁵⁵ dʑa⁵⁵ tɕhi³³.', translation: '谷子已经摊开晒了。', source: '田野记录 2023-09-12' }],
    sources: [{ id: 'src-3', title: '东南村生产词调查', citation: '王某某，2023，词条 071', url: '' }],
    synonyms: ['晒', '等待'], status: 'review', notes: '“等待”的引申义需由审校人确认。', createdAt: '2024-10-01T06:00:00.000Z', updatedAt: '2025-02-18T02:00:00.000Z',
    reviewerComments: [{ id: 'c-1', field: 'definition', author: '主审·和老师', message: '“等待”是短语层面的临时义还是固定引申义？请补充一条例句。', status: 'open', createdAt: '2025-02-18T02:00:00.000Z', replies: [] }]
  },
  {
    id: 'entry-003', headword: 'dʑa³³', pronunciation: 'dʑa˧', partOfSpeech: '动词', definition: '摊晒谷物，使水分蒸发。', dialectVariants: [], examples: [{ id: 'ex-4', text: 'dʑa³³ ko⁵⁵ kho⁵⁵.', translation: '把粮食拿去晒。', source: '语音调查 M-12' }], sources: [{ id: 'src-4', title: '方言调查卡片', citation: '1992，卡片 M-12', url: '' }], synonyms: ['晒粮'], status: 'disputed', notes: '与 dʑa⁵⁵ 可能是同一词条的声调变体。', createdAt: '2024-12-01T06:00:00.000Z', updatedAt: '2025-02-20T03:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-004', headword: 'ʔma³³', pronunciation: 'ʔma˧', partOfSpeech: '名词', definition: '母亲；也可用于称呼年长女性亲属。', dialectVariants: [{ id: 'v-4', dialect: '河西话', form: 'ma³³', pronunciation: 'ma', note: '喉塞音弱化' }], examples: [{ id: 'ex-5', text: 'ʔma³³, ŋa⁵⁵ tɕi³³ lo³³.', translation: '妈妈，我要回家了。', source: '日常生活会话 01' }], sources: [{ id: 'src-5', title: '亲缘称谓调查', citation: '赵某某，2011，表 3', url: '' }], synonyms: ['妈妈', '母亲'], status: 'draft', notes: '需补充敬称形式。', createdAt: '2025-01-11T04:00:00.000Z', updatedAt: '2025-01-11T04:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-005', headword: 'lo³³', pronunciation: 'lo˧', partOfSpeech: '方向词', definition: '表示向说话者所在位置移动，常与位移动词搭配。', dialectVariants: [], examples: [{ id: 'ex-6', text: 'a³³ mɨ⁵⁵ lo³³.', translation: '到这里来。', source: '语法调查句表 03' }], sources: [{ id: 'src-6', title: '动词方向范畴笔记', citation: '陈某某，2005，第 18 页', url: '' }], synonyms: ['来'], status: 'confirmed', notes: '', createdAt: '2024-09-18T02:00:00.000Z', updatedAt: '2025-01-04T02:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-006', headword: 'tsha⁵⁵', pronunciation: 'tsha˥', partOfSpeech: '名词', definition: '水源；泉水涌出的地方。', dialectVariants: [], examples: [{ id: 'ex-7', text: 'tsha⁵⁵ ʔmɨ⁵⁵ ma³³.', translation: '泉眼在这个地方。', source: '地名调查 2022-07' }], sources: [{ id: 'src-7', title: '村落地名调查', citation: '录音 C-2022-07，00:22:08', url: '' }], synonyms: ['泉眼', '水潭'], status: 'review', notes: '', createdAt: '2025-02-01T02:00:00.000Z', updatedAt: '2025-02-25T02:00:00.000Z',
    reviewerComments: [{ id: 'c-2', field: 'sources', author: '审校·罗老师', message: '请把录音中发言人姓名补到资料来源。', status: 'open', createdAt: '2025-02-25T02:00:00.000Z', replies: [{ id: 'r-1', author: '编辑·阿木', message: '已向调查员索取授权信息，暂以录音编号占位。', createdAt: '2025-02-26T01:00:00.000Z' }] }]
  }
];

const seedAudit = (): AuditRecord[] => [{
  id: 'audit-seed', at: now(), action: '载入工作区', detail: '初始化 6 个词条、2 条待回复审校意见和 1 组疑似重复词条', entryIds: []
}];

interface StoredPayload extends DictionarySnapshot {
  format: number;
  savedAt: string;
  tabId: string;
}

type WriteOutcome =
  | { ok: true; compacted: string[] }
  | { ok: false; reason: 'quota' | 'conflict'; remote: StoredPayload | null; candidate: DictionarySnapshot; compacted: string[] };

export const useDictionaryStore = defineStore('dictionary', () => {
  const tabId = uid('tab');
  const revision = ref(1);
  const entries = reactive<DictionaryEntry[]>(seedEntries());
  const versions = reactive<VersionRecord[]>([]);
  const audit = reactive<AuditRecord[]>(seedAudit());
  const selectedId = ref(entries[0]?.id ?? '');
  const hydrated = ref(false);
  const undoStack = ref<DictionarySnapshot[]>([]);
  const redoStack = ref<DictionarySnapshot[]>([]);
  const query = ref('');
  const statusFilter = ref<EntryStatus | 'all'>('all');
  const dialectFilter = ref('all');
  const fieldReplyDrafts = reactive<Record<string, string>>({});

  const saveStatus = ref<SaveStatus>({ kind: 'saving', message: '正在载入本地数据…' });
  const usage = ref<StorageUsage>({ used: 0, quota: 0, headroom: 0, ratio: 0, mainBytes: 0 });
  const lastCompactedIds = ref<string[]>([]);
  const drafts = ref<PendingDraft[]>([]);
  const activeDraftId = ref<string | null>(null);
  const draftsOpen = ref(false);

  let lastPersisted: StoredPayload | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const selectedEntry = computed(() => entries.find((entry) => entry.id === selectedId.value) ?? entries[0]);
  const activeDraft = computed(() => drafts.value.find((draft) => draft.id === activeDraftId.value) ?? drafts.value[0] ?? null);
  const persistableSnapshot = computed<DictionarySnapshot>(() => ({
    revision: revision.value,
    entries: clone(entries),
    versions: clone(versions),
    audit: clone(audit)
  }));
  const duplicates = computed<DuplicatePair[]>(() => findDuplicates(entries));
  const openComments = computed(() => entries.reduce((sum, entry) => sum + entry.reviewerComments.filter((comment) => comment.status === 'open').length, 0));
  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter.value !== 'all' && entry.status !== statusFilter.value) return false;
      if (dialectFilter.value && !entry.dialectVariants.some((variant) => variant.dialect === dialectFilter.value)) return false;
      if (!term) return true;
      const haystack = [entry.headword, entry.definition, entry.partOfSpeech, entry.pronunciation, ...entry.synonyms, ...entry.sources.map((source) => source.title)].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  });
  const dialects = computed(() => [...new Set(entries.flatMap((entry) => entry.dialectVariants.map((variant) => variant.dialect)))].sort());

  // ---- 串行化所有提交，避免快速连续编辑互相覆盖 ------------------------------------
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task) as Promise<T>;
    queue = run.catch(() => undefined);
    return run;
  };

  function setSaveStatus(kind: SaveStatus['kind'], message: string) {
    saveStatus.value = { kind, message };
  }

  function snapshot(): DictionarySnapshot {
    return {
      revision: revision.value,
      entries: clone(entries),
      versions: clone(versions),
      audit: clone(audit)
    };
  }

  function restore(value: DictionarySnapshot) {
    revision.value = value.revision ?? 1;
    entries.splice(0, entries.length, ...clone(value.entries ?? []));
    versions.splice(0, versions.length, ...clone(value.versions ?? []));
    audit.splice(0, audit.length, ...clone(value.audit ?? []));
    if (!entries.some((entry) => entry.id === selectedId.value)) selectedId.value = entries[0]?.id ?? '';
  }

  // ---- 时间线派生的撤销链：目标状态即每条版本的 before，遇到已压缩快照即停止 --------
  function rebuildUndoChain() {
    const chain: DictionarySnapshot[] = [];
    for (let index = 0; index < versions.length; index += 1) {
      const record = versions[index]!;
      // 已压缩快照在时间线尾部，线性撤销不能跳过缺失的中间状态。
      if (record.compacted || !record.before.length) break;
      chain.push({
        revision: record.revision ? Math.max(1, record.revision - 1) : Math.max(1, revision.value - (index + 1)),
        entries: clone(record.before),
        // 回到该状态时，时间线只保留它之前的版本。
        versions: clone(versions.slice(index + 1)),
        audit: clone(audit.slice(index + 1))
      });
    }
    // versions 新到旧，最旧目标放在链底：栈顶 = 最近一次提交之前。
    undoStack.value = chain.reverse();
  }

  // ---- 预算与写入 ----------------------------------------------------------------
  function toPayload(candidate: DictionarySnapshot): StoredPayload {
    return { format: PAYLOAD_FORMAT, savedAt: now(), tabId, ...clone(candidate) };
  }

  function readRemote(): StoredPayload | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredPayload>;
      if (Array.isArray(parsed.entries)) return parsed as StoredPayload;
    } catch {
      // 数据损坏：不当作远端修订，交给初始化清理。
    }
    return null;
  }

  /**
   * 计算需要压缩掉的字节并执行压缩。sufficient 表示“在不动受保护快照的前提下足以放下”。
   * 写入会整体替换主数据键，因此预算按“新主数据 ≤ 配额 − 其他来源占用 − 安全垫”计算。
   * 压缩方案只作用于中间未固定旧快照；最早恢复点、固定版本、撤销栈顶永不参与。
   */
  async function planCompaction(candidate: DictionarySnapshot, forceSaving = 0) {
    const current = await readUsage(STORAGE_KEY);
    const otherBytes = Math.max(0, current.used - current.mainBytes);
    const margin = Math.min(128 * 1024, Math.floor(current.quota * 0.05));
    const availableForMain = Math.max(0, current.quota - otherBytes - margin);
    const payloadBytes = serializedBytes(toPayload(candidate));
    const needSaving = Math.max(forceSaving, payloadBytes - availableForMain);
    if (needSaving <= 0) return { candidate, dropped: [] as string[], sufficient: true };
    const result = compactVersions(candidate.versions, needSaving);
    return {
      candidate: result.changed ? { ...candidate, versions: result.versions } : candidate,
      dropped: result.dropped,
      sufficient: result.sufficient
    };
  }

  function writePayload(payload: StoredPayload): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 事务写入：先核对远端修订，再按预算压缩（只丢弃未固定的中间旧快照），落盘前再次核对。
   * 容量不足、压缩仍放不下或存在更新修订时都返回失败原因；调用方整笔回滚并转入草稿。
   * 绝不覆盖另一标签页的新修订，也绝不动最早恢复点与固定关键版本。
   */
  async function writeCandidate(
    candidate: DictionarySnapshot,
    baseRevision: number,
    opts: { forceSaving?: number } = {}
  ): Promise<WriteOutcome> {
    const remote = readRemote();
    if (remote && remote.revision > baseRevision) {
      return { ok: false, reason: 'conflict', remote, candidate, compacted: [] };
    }

    const work = await planCompaction(candidate, opts.forceSaving ?? 0);
    if (!work.sufficient) {
      // 可丢弃集合用尽仍放不下：受保护快照不可牺牲，直接拒绝整笔写入。
      return { ok: false, reason: 'quota', remote, candidate: work.candidate, compacted: work.dropped };
    }
    const payload = toPayload(work.candidate);

    // 压缩估算期间另一标签页可能已提交：写入前再核对一次，避免覆盖其新修订。
    const beforeWrite = readRemote();
    if (beforeWrite && beforeWrite.revision > baseRevision) {
      return { ok: false, reason: 'conflict', remote: beforeWrite, candidate: work.candidate, compacted: work.dropped };
    }

    if (!writePayload(payload)) {
      // 估算与浏览器实际占用有少量偏差：再压一点可丢弃快照（带安全垫），仍不够则拒绝。
      const refined = compactVersions(work.candidate.versions, 4096);
      if (refined.changed && refined.sufficient) {
        const refinedCandidate = { ...work.candidate, versions: refined.versions };
        const recheck = readRemote();
        if (recheck && recheck.revision > baseRevision) {
          return { ok: false, reason: 'conflict', remote: recheck, candidate: refinedCandidate, compacted: refined.dropped };
        }
        const refinedPayload = toPayload(refinedCandidate);
        if (writePayload(refinedPayload)) {
          lastPersisted = refinedPayload;
          void refreshUsage();
          return { ok: true, compacted: refined.dropped };
        }
      }
      return { ok: false, reason: 'quota', remote: beforeWrite, candidate: work.candidate, compacted: work.dropped };
    }

    lastPersisted = payload;
    void refreshUsage();
    return { ok: true, compacted: work.dropped };
  }

  // ---- 草稿（未保存的整笔提交） ---------------------------------------------------
  /** 是否存在会阻止本标签页继续编辑的草稿：仅本标签页产生的草稿才阻塞；其他标签页残留的草稿只作待办提示。 */
  const hasBlockingDraft = computed(() => drafts.value.some((draft) => draft.tabId === tabId));

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) drafts.value = JSON.parse(raw) as PendingDraft[];
    } catch {
      drafts.value = [];
    }
    activeDraftId.value = drafts.value[0]?.id ?? null;
    draftsOpen.value = drafts.value.some((draft) => draft.tabId === tabId);
    if (activeDraftId.value) {
      const draft = drafts.value[0]!;
      const own = draft.tabId === tabId;
      setSaveStatus(
        draft.reason === 'quota' ? 'quota' : 'conflict',
        own
          ? `有一笔未保存改动：${draft.action}（${draft.conflicts.length ? `${draft.conflicts.length} 处冲突待处理` : '可重试'}）`
          : `检测到其他标签页遗留的未保存改动：${draft.action}，可在草稿对话框中处理`
      );
    }
  }

  function persistDrafts() {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.value));
    } catch {
      // 草稿本身也放不下时至少保留内存中的一份，本标签页关闭前可重试或导出。
    }
  }

  function computeConflicts(base: DictionarySnapshot, candidate: DictionarySnapshot, remote: DictionarySnapshot): PendingConflict[] {
    const byId = (list: DictionaryEntry[]) => new Map(list.map((entry) => [entry.id, entry]));
    const b = byId(base.entries);
    const l = byId(candidate.entries);
    const r = byId(remote.entries);
    const conflicts: PendingConflict[] = [];
    const ids = new Set([...b.keys(), ...l.keys(), ...r.keys()]);
    ids.forEach((id) => {
      const baseEntry = b.get(id) ?? null;
      const localEntry = l.get(id) ?? null;
      const remoteEntry = r.get(id) ?? null;
      if (same(localEntry ?? null, remoteEntry ?? null)) return;
      const localChanged = !same(baseEntry ?? null, localEntry ?? null);
      const remoteChanged = !same(baseEntry ?? null, remoteEntry ?? null);
      if (!localChanged || !remoteChanged) return;
      let kind: PendingConflict['kind'] = 'modified';
      if (!localEntry && remoteEntry) kind = 'deleted-local';
      if (localEntry && !remoteEntry) kind = 'deleted-remote';
      conflicts.push({
        entryId: id,
        headword: localEntry?.headword || remoteEntry?.headword || '已删除词条',
        kind,
        local: localEntry ? clone(localEntry) : null,
        remote: remoteEntry ? clone(remoteEntry) : null,
        resolution: null
      });
    });
    return conflicts;
  }

  function stashDraft(
    kind: PendingDraft['kind'],
    reason: PendingDraft['reason'],
    action: string,
    detail: string,
    base: DictionarySnapshot,
    candidate: DictionarySnapshot,
    remote: StoredPayload | null
  ): PendingDraft {
    const conflicts = remote ? computeConflicts(base, candidate, remote) : [];
    const draft: PendingDraft = {
      id: uid('draft'),
      tabId,
      kind,
      reason,
      action,
      detail,
      createdAt: now(),
      updatedAt: now(),
      base: clone(base),
      candidate: clone(candidate),
      pinnedMeta: candidate.versions.filter((record) => record.pinned).map((record) => record.id),
      conflicts
    };
    drafts.value = [draft, ...drafts.value];
    activeDraftId.value = draft.id;
    draftsOpen.value = true;
    persistDrafts();
    if (reason === 'quota') {
      setSaveStatus('quota', `存储空间不足，已拒绝写入并整笔撤回“${action}”，改动保留为可重试草稿`);
    } else {
      setSaveStatus('conflict', `另一标签页存在更新修订，“${action}”已整笔撤回，${conflicts.length ? `请先处理 ${conflicts.length} 处冲突` : '可直接重试合并'}`);
    }
    return draft;
  }

  function discardDraft(draftId: string) {
    drafts.value = drafts.value.filter((draft) => draft.id !== draftId);
    persistDrafts();
    activeDraftId.value = drafts.value[0]?.id ?? null;
    draftsOpen.value = drafts.value.length > 0;
    if (!drafts.value.length) setSaveStatus('saved', '本地数据已同步');
  }

  function setDraftResolution(draftId: string, entryId: string, resolution: PendingConflict['resolution']) {
    const draft = drafts.value.find((item) => item.id === draftId);
    const conflict = draft?.conflicts.find((item) => item.entryId === entryId);
    if (conflict) conflict.resolution = resolution;
    persistDrafts();
  }

  function mergeSnapshots(
    base: DictionarySnapshot,
    local: DictionarySnapshot,
    remote: DictionarySnapshot
  ): { snapshot: DictionarySnapshot; conflicts: PendingConflict[] } {
    const byId = (list: DictionaryEntry[]) => new Map(list.map((entry) => [entry.id, entry]));
    const b = byId(base.entries);
    const l = byId(local.entries);
    const r = byId(remote.entries);
    const merged: DictionaryEntry[] = [];
    const push = (entry: DictionaryEntry | undefined | null) => {
      if (entry && !merged.some((item) => item.id === entry.id)) merged.push(clone(entry));
    };
    // 远端顺序优先，本地新增追加在后。
    remote.entries.forEach((remoteEntry) => {
      const id = remoteEntry.id;
      const baseEntry = b.get(id);
      const localEntry = l.get(id);
      // 本页已删除（基线存在、本地不存在）：默认以删除为准；远端同时改过则由冲突解决覆盖。
      if (b.has(id) && !l.has(id)) return;
      if (!b.has(id) || same(baseEntry ?? null, localEntry ?? null)) { push(remoteEntry); return; }
      if (same(baseEntry ?? null, remoteEntry)) { push(localEntry); return; }
      push(remoteEntry); // 双方都改：默认取远端，冲突由草稿解决流程覆盖
    });
    local.entries.forEach((localEntry) => {
      if (!r.has(localEntry.id) && !b.has(localEntry.id)) push(localEntry);
    });

    const versionMap = new Map<string, VersionRecord>();
    [...local.versions, ...remote.versions].forEach((record) => {
      const existing = versionMap.get(record.id);
      if (!existing || (record.revision ?? 0) > (existing.revision ?? 0)) versionMap.set(record.id, clone(record));
    });
    // 合并后时间线可能超上限：只裁掉最旧的已压缩未固定占位，保留全部完整恢复点。
    const sortedVersions = [...versionMap.values()].sort((a, z) => (z.revision ?? 0) - (a.revision ?? 0) || Date.parse(z.at) - Date.parse(a.at));
    const removableTail: VersionRecord[] = [];
    for (let i = sortedVersions.length - 1; i >= 0 && sortedVersions.length - removableTail.length > MAX_VERSIONS; i -= 1) {
      const record = sortedVersions[i]!;
      if (!record.pinned && record.compacted && !record.before.length) removableTail.push(record);
      else break;
    }
    const droppedMerge = new Set(removableTail.map((record) => record.id));
    const mergedVersions = sortedVersions.filter((record) => !droppedMerge.has(record.id));

    const auditMap = new Map<string, AuditRecord>();
    [...local.audit, ...remote.audit].forEach((item) => auditMap.set(item.id, clone(item)));
    const mergedAudit = [...auditMap.values()].sort((a, z) => Date.parse(z.at) - Date.parse(a.at)).slice(0, MAX_AUDIT);

    // 合并修订号 = 远端 + 本地领先基线的提交数；本地无新增提交时严格等于远端（不虚增修订号）。
    const localAhead = Math.max(0, local.revision - base.revision);
    const result: DictionarySnapshot = {
      revision: remote.revision + localAhead,
      entries: merged,
      versions: mergedVersions,
      audit: mergedAudit
    };
    return { snapshot: result, conflicts: computeConflicts(base, local, remote) };
  }

  function applyConflictResolutions(snapshotValue: DictionarySnapshot, draft: PendingDraft): DictionarySnapshot {
    const next = clone(snapshotValue);
    draft.conflicts.forEach((conflict) => {
      const index = next.entries.findIndex((entry) => entry.id === conflict.entryId);
      if (conflict.resolution === 'local') {
        if (conflict.local) {
          if (index >= 0) next.entries.splice(index, 1, clone(conflict.local));
          else next.entries.push(clone(conflict.local));
        } else if (index >= 0) next.entries.splice(index, 1);
      } else if (conflict.resolution === 'remote') {
        if (conflict.remote) {
          if (index >= 0) next.entries.splice(index, 1, clone(conflict.remote));
          else next.entries.push(clone(conflict.remote));
        } else if (index >= 0) next.entries.splice(index, 1);
      }
    });
    return next;
  }

  async function retryDraft(draftId: string): Promise<boolean> {
    return enqueue(async () => {
      const draft = drafts.value.find((item) => item.id === draftId);
      if (!draft) return false;
      const unresolved = draft.conflicts.some((conflict) => conflict.resolution === null);
      if (unresolved) {
        setSaveStatus('conflict', `还有 ${draft.conflicts.filter((item) => item.resolution === null).length} 处冲突未选择保留哪一侧`);
        return false;
      }
      const remote = readRemote();
      let candidate: DictionarySnapshot;
      if (remote) {
        const merged = mergeSnapshots(draft.base, draft.candidate, remote);
        candidate = applyConflictResolutions(merged.snapshot, draft);
        candidate.versions.forEach((record) => { if (draft.pinnedMeta.includes(record.id)) record.pinned = true; });
        // 重试这笔草稿本身是一次新提交：修订号在合并结果上再 +1，并挂到本地待提交版本上。
        const newRevision = merged.snapshot.revision + 1;
        candidate.revision = newRevision;
        const localVersionIds = new Set(draft.candidate.versions.map((record) => record.id));
        candidate.versions.forEach((record) => {
          if (localVersionIds.has(record.id) && (!record.revision || record.revision <= remote.revision)) record.revision = newRevision;
        });
      } else {
        candidate = clone(draft.candidate);
      }
      const outcome = await writeCandidate(candidate, remote ? remote.revision : draft.base.revision);
      if (outcome.ok) {
        restore(candidate);
        lastCompactedIds.value = outcome.compacted;
        rebuildUndoChain();
        redoStack.value = [];
        drafts.value = drafts.value.filter((item) => item.id !== draftId);
        persistDrafts();
        activeDraftId.value = drafts.value[0]?.id ?? null;
        draftsOpen.value = drafts.value.length > 0;
        setSaveStatus('saved', outcome.compacted.length ? `重试成功；为腾出空间压缩了 ${outcome.compacted.length} 个旧快照` : '本地数据已同步');
        return true;
      }
      if (outcome.reason === 'conflict' && outcome.remote) {
        // 以刚并入的远端修订为新共同祖先，重新计算与更新远端的冲突。
        const newBase: DictionarySnapshot = remote
          ? { revision: remote.revision, entries: clone(remote.entries), versions: clone(remote.versions), audit: clone(remote.audit) }
          : draft.base;
        draft.base = newBase;
        draft.candidate = candidate;
        draft.conflicts = computeConflicts(newBase, candidate, outcome.remote);
        draft.updatedAt = now();
        persistDrafts();
        setSaveStatus('conflict', `另一标签页又有新修订，请重新确认 ${draft.conflicts.length} 处冲突`);
        return false;
      }
      draft.candidate = outcome.candidate;
      draft.reason = 'quota';
      draft.updatedAt = now();
      persistDrafts();
      setSaveStatus('quota', '存储空间仍然不足，草稿继续保留，可固定更少版本或导出备份后重试');
      return false;
    });
  }

  // ---- 提交 ----------------------------------------------------------------------
  /** 时间线超上限时只删除“最旧的、已压缩且未固定”的占位条目，绝不删完整恢复点/关键版本。 */
  function trimTimeline() {
    for (let i = versions.length - 1; i >= 0 && versions.length > MAX_VERSIONS; i -= 1) {
      const record = versions[i]!;
      if (!record.pinned && record.compacted && !record.before.length) versions.splice(i, 1);
    }
  }

  function commit(action: string, detail: string, entryIds: string[], mutation: () => void): Promise<boolean> {
    return enqueue(async () => {
      if (!hydrated.value) return false;
      if (hasBlockingDraft.value) {
        setSaveStatus(activeDraft.value?.reason === 'quota' ? 'quota' : 'conflict', '存在本页未保存草稿，请先重试或放弃后再编辑，避免改动叠加');
        return false;
      }

      const base = snapshot();
      const baseRevision = lastPersisted?.revision ?? revision.value;
      redoStack.value = [];

      mutation();
      revision.value = baseRevision + 1;
      entries.forEach((entry) => { if (entryIds.includes(entry.id)) entry.updatedAt = now(); });
      const auditRecord: AuditRecord = { id: uid('audit'), at: now(), action, detail, entryIds };
      const versionRecord: VersionRecord = {
        id: uid('version'),
        at: auditRecord.at,
        action,
        detail,
        entryId: entryIds[0],
        before: clone(base.entries),
        revision: revision.value
      };
      versions.unshift(versionRecord);
      trimTimeline();
      audit.unshift(auditRecord);
      audit.splice(MAX_AUDIT);

      const candidate = snapshot();
      const outcome = await writeCandidate(candidate, baseRevision);

      if (outcome.ok) {
        if (outcome.compacted.length) {
          const keep = new Set(outcome.compacted);
          versions.forEach((record) => {
            if (keep.has(record.id)) {
              record.before = [];
              record.compacted = true;
            }
          });
          lastCompactedIds.value = outcome.compacted;
          setSaveStatus('saved', `本地数据已同步；空间紧张，已压缩 ${outcome.compacted.length} 个未固定旧快照（时间线保留）`);
        } else {
          lastCompactedIds.value = [];
          setSaveStatus('saved', '本地数据已同步');
        }
        rebuildUndoChain();
        return true;
      }

      // 失败：整笔撤回内存状态，只留草稿和重试入口。
      restore(base);
      stashDraft('commit', outcome.reason, action, detail, base, outcome.candidate, outcome.remote);
      rebuildUndoChain();
      return false;
    });
  }

  // ---- 词条操作 ------------------------------------------------------------------
  function createEntry() {
    const entry: DictionaryEntry = {
      id: uid('entry'), headword: '新词条', pronunciation: '', partOfSpeech: '', definition: '', dialectVariants: [], examples: [], sources: [], synonyms: [], status: 'draft', notes: '', createdAt: now(), updatedAt: now(), reviewerComments: []
    };
    return commit('新建词条', '创建草稿词条', [entry.id], () => { entries.unshift(entry); selectedId.value = entry.id; });
  }

  function updateField<K extends keyof DictionaryEntry>(entryId: string, field: K, value: DictionaryEntry[K], label = String(field)) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || JSON.stringify(entry[field]) === JSON.stringify(value)) return;
    return commit('编辑字段', `${label}发生更新`, [entryId], () => { entry[field] = value; });
  }

  function setStatus(entryId: string, status: EntryStatus) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || entry.status === status) return;
    const labels: Record<EntryStatus, string> = { draft: '草稿', review: '待审', disputed: '争议', confirmed: '已确认' };
    return commit('变更状态', `词条状态改为“${labels[status]}”`, [entryId], () => { entry.status = status; });
  }

  function addVariant(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    const variant = { id: uid('variant'), dialect: '', form: '', pronunciation: '', note: '' };
    return commit('新增方言变体', '添加一条方言变体', [entryId], () => entry.dialectVariants.push(variant));
  }

  function updateVariant(entryId: string, variantId: string, field: 'dialect' | 'form' | 'pronunciation' | 'note', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const variant = entry?.dialectVariants.find((item) => item.id === variantId);
    if (!entry || !variant || variant[field] === value) return;
    return commit('编辑方言变体', `${field}发生更新`, [entryId], () => { variant[field] = value; });
  }

  function removeVariant(entryId: string, variantId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('删除方言变体', '移除一条方言变体', [entryId], () => {
      const index = entry.dialectVariants.findIndex((variant) => variant.id === variantId);
      if (index >= 0) entry.dialectVariants.splice(index, 1);
    });
  }

  function addExample(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('新增例句', '添加一条例句', [entryId], () => entry.examples.push({ id: uid('example'), text: '', translation: '', source: '' }));
  }

  function updateExample(entryId: string, exampleId: string, field: 'text' | 'translation' | 'source', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const example = entry?.examples.find((item) => item.id === exampleId);
    if (!entry || !example || example[field] === value) return;
    return commit('编辑例句', `${field}发生更新`, [entryId], () => { example[field] = value; });
  }

  function removeExample(entryId: string, exampleId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('删除例句', '移除一条例句', [entryId], () => {
      const index = entry.examples.findIndex((item) => item.id === exampleId);
      if (index >= 0) entry.examples.splice(index, 1);
    });
  }

  function addSource(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('新增来源', '添加一条文献或录音来源', [entryId], () => entry.sources.push({ id: uid('source'), title: '', citation: '', url: '' }));
  }

  function updateSource(entryId: string, sourceId: string, field: 'title' | 'citation' | 'url', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const source = entry?.sources.find((item) => item.id === sourceId);
    if (!entry || !source || source[field] === value) return;
    return commit('编辑来源', `${field}发生更新`, [entryId], () => { source[field] = value; });
  }

  function removeSource(entryId: string, sourceId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('删除来源', '移除一条来源', [entryId], () => {
      const index = entry.sources.findIndex((source) => source.id === sourceId);
      if (index >= 0) entry.sources.splice(index, 1);
    });
  }

  function setSynonyms(entryId: string, synonyms: string[]) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    return commit('编辑同义词', `同义词更新为 ${synonyms.join('、') || '（空）'}`, [entryId], () => { entry.synonyms = synonyms; });
  }

  function addComment(entryId: string, field: string, message: string, author = '主审·和老师') {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !message.trim()) return;
    const comment: ReviewComment = { id: uid('comment'), field, author, message: message.trim(), status: 'open', createdAt: now(), replies: [] };
    return commit('新增审校意见', `对“${field}”添加审校意见`, [entryId], () => entry.reviewerComments.unshift(comment));
  }

  function replyComment(entryId: string, commentId: string, message: string, author = '编辑·阿木') {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry?.reviewerComments.find((item) => item.id === commentId);
    if (!entry || !comment || !message.trim()) return;
    return commit('回复审校意见', `回复“${comment.field}”字段意见`, [entryId], () => comment.replies.push({ id: uid('reply'), author, message: message.trim(), createdAt: now() }));
  }

  function toggleComment(entryId: string, commentId: string) {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry?.reviewerComments.find((item) => item.id === commentId);
    if (!entry || !comment) return;
    return commit('处理审校意见', comment.status === 'open' ? '标记为已解决' : '重新打开意见', [entryId], () => {
      comment.status = comment.status === 'open' ? 'resolved' : 'open';
    });
  }

  function deleteEntry(entryId: string): Promise<boolean> {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return Promise.resolve(false);
    return commit('删除词条', `删除“${entry.headword}”`, [entryId], () => {
      const index = entries.findIndex((item) => item.id === entryId);
      if (index >= 0) entries.splice(index, 1);
      selectedId.value = entries[0]?.id ?? '';
    });
  }

  function mergeEntries(targetId: string, sourceIds: string[], selected: Record<string, 'target' | 'source' | 'combine'>): Promise<boolean> {
    const target = entries.find((entry) => entry.id === targetId);
    const sources = entries.filter((entry) => sourceIds.includes(entry.id));
    if (!target || !sources.length) return Promise.resolve(false);
    return commit('合并重复词条', `将 ${sources.length} 个重复词条合并到“${target.headword}”`, [targetId, ...sourceIds], () => {
      sources.forEach((source) => {
        const layers: Array<keyof DictionaryEntry> = ['dialectVariants', 'examples', 'sources', 'synonyms', 'reviewerComments'];
        layers.forEach((field) => {
          const targetValue = target[field] as unknown[];
          const sourceValue = source[field] as unknown[];
          targetValue.push(...clone(sourceValue));
        });
      });
      (['headword', 'pronunciation', 'partOfSpeech', 'definition', 'notes'] as const).forEach((field) => {
        const choice = selected[field] ?? 'target';
        if (choice === 'source') target[field] = sources[0]![field];
        if (choice === 'combine' && target[field] !== sources[0]![field]) target[field] = `${target[field]}；${sources[0]![field]}`;
      });
      target.status = 'disputed';
      sourceIds.forEach((id) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index >= 0) entries.splice(index, 1);
      });
    });
  }

  // ---- 撤销 / 重做（同样走预算与修订校验；失败则保留当前状态并生成草稿） ----------------
  function persistStateNode(node: DictionarySnapshot, label: string): Promise<boolean> {
    return enqueue(async () => {
      if (hasBlockingDraft.value) {
        setSaveStatus('conflict', '存在本页未保存草稿，请先处理后再撤销或重做');
        return false;
      }
      const baseRevision = lastPersisted?.revision ?? revision.value;
      const outcome = await writeCandidate(node, baseRevision);
      if (!outcome.ok) {
        const base = lastPersisted ? {
          revision: lastPersisted.revision,
          entries: clone(lastPersisted.entries),
          versions: clone(lastPersisted.versions),
          audit: clone(lastPersisted.audit)
        } : snapshot();
        stashDraft('commit', outcome.reason, label, label, base, outcome.candidate, outcome.remote);
        return false;
      }
      restore(node);
      if (outcome.compacted.length) {
        const keep = new Set(outcome.compacted);
        versions.forEach((record) => {
          if (keep.has(record.id)) { record.before = []; record.compacted = true; }
        });
      }
      rebuildUndoChain();
      return true;
    });
  }

  function undo() {
    const target = undoStack.value.at(-1);
    if (!target) return;
    const beforeNode = snapshot();
    void persistStateNode(target, '撤销操作').then((ok) => {
      if (!ok) return;
      // rebuildUndoChain 已按目标时间线重算撤销栈，只需把当前状态送入重做栈。
      redoStack.value = [...redoStack.value, beforeNode];
    });
  }

  function redo() {
    const target = redoStack.value.at(-1);
    if (!target) return;
    const beforeNode = snapshot();
    void persistStateNode(target, '重做操作').then((ok) => {
      if (!ok) return;
      redoStack.value = redoStack.value.slice(0, -1);
      undoStack.value = [...undoStack.value, beforeNode];
    });
  }

  function restoreVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version || !version.before.length) return;
    return commit('恢复版本', `恢复 ${new Date(version.at).toLocaleString('zh-CN')} 之前的版本`, [], () => {
      entries.splice(0, entries.length, ...clone(version.before));
    });
  }

  // ---- 固定关键版本 / 手动压缩 -----------------------------------------------------
  function pinVersion(versionId: string) {
    const record = versions.find((item) => item.id === versionId);
    if (!record || record.pinned || !record.before.length) return;
    void enqueue(async () => {
      const base = snapshot();
      record.pinned = true;
      const candidate = snapshot();
      const outcome = await writeCandidate(candidate, lastPersisted?.revision ?? revision.value);
      if (outcome.ok) {
        setSaveStatus('saved', '已固定该关键版本，压缩存储时会保留其完整快照');
        return;
      }
      restore(base);
      stashDraft('pin', outcome.reason, '固定关键版本', record.action, base, outcome.candidate, outcome.remote);
    });
  }

  function unpinVersion(versionId: string) {
    const record = versions.find((item) => item.id === versionId);
    if (!record || !record.pinned) return;
    void enqueue(async () => {
      const base = snapshot();
      record.pinned = false;
      const candidate = snapshot();
      const outcome = await writeCandidate(candidate, lastPersisted?.revision ?? revision.value);
      if (outcome.ok) { setSaveStatus('saved', '已取消固定'); return; }
      restore(base);
      stashDraft('pin', outcome.reason, '取消固定版本', record.action, base, outcome.candidate, outcome.remote);
    });
  }

  function compactNow() {
    void enqueue(async () => {
      const candidate = snapshot();
      const outcome = await writeCandidate(candidate, lastPersisted?.revision ?? revision.value, {
        forceSaving: Math.max(0, serializedValuesToTrim(candidate))
      });
      if (!outcome.ok) {
        stashDraft('compact', outcome.reason, '手动压缩版本', '主动压缩旧快照', snapshot(), outcome.candidate, outcome.remote);
        return;
      }
      if (outcome.compacted.length) {
        const keep = new Set(outcome.compacted);
        versions.forEach((record) => { if (keep.has(record.id)) { record.before = []; record.compacted = true; } });
        rebuildUndoChain();
        redoStack.value = [];
      }
      setSaveStatus('saved', outcome.compacted.length ? `已压缩 ${outcome.compacted.length} 个未固定旧快照` : '暂无可压缩的旧快照');
    });
  }

  function serializedValuesToTrim(candidate: DictionarySnapshot): number {
    // 手动压缩目标：主数据占用压到配额的 70%，给后续编辑留出空间。
    const quota = usage.value.quota || 0;
    if (!quota) return 0;
    const otherUsage = Math.max(0, usage.value.used - usage.value.mainBytes);
    const desiredMain = quota * 0.7 - otherUsage;
    return Math.max(0, serializedBytes(toPayload(candidate)) - desiredMain);
  }

  function canRestoreVersion(versionId: string) {
    const record = versions.find((item) => item.id === versionId);
    return !!record && !record.compacted && record.before.length > 0;
  }

  // ---- 初始化与跨标签页 -----------------------------------------------------------
  async function refreshUsage() {
    usage.value = await readUsage(STORAGE_KEY);
  }

  function ingestExternalSave(event: StorageEvent) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    let remote: StoredPayload;
    try {
      remote = JSON.parse(event.newValue) as StoredPayload;
    } catch {
      return;
    }
    if (!Array.isArray(remote.entries) || remote.revision <= (lastPersisted?.revision ?? 0)) return;

    if (drafts.value.length) {
      // 草稿挂起时只更新冲突视图，绝不用远端直接覆盖本页内存。
      drafts.value.forEach((draft) => {
        draft.conflicts = computeConflicts(draft.base, draft.candidate, remote);
        draft.updatedAt = now();
      });
      persistDrafts();
      setSaveStatus('conflict', `另一标签页提交了新修订 r${remote.revision}，已并入冲突比对，请处理后重试`);
      return;
    }

    const base: DictionarySnapshot = lastPersisted
      ? { revision: lastPersisted.revision, entries: clone(lastPersisted.entries), versions: clone(lastPersisted.versions), audit: clone(lastPersisted.audit) }
      : snapshot();
    const merged = mergeSnapshots(base, snapshot(), remote).snapshot;
    restore(merged);
    lastPersisted = remote;
    rebuildUndoChain();
    redoStack.value = [];
    setSaveStatus('saved', `已并入另一标签页的新修订 r${remote.revision}`);
    void refreshUsage();
  }

  async function hydrateFromBrowser() {
    loadDrafts();
    let legacy = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredPayload>;
        if (Array.isArray(parsed.entries)) {
          restore(parsed as DictionarySnapshot);
          lastPersisted = parsed.format === PAYLOAD_FORMAT ? (parsed as StoredPayload) : toPayload(parsed as DictionarySnapshot);
          legacy = parsed.format !== PAYLOAD_FORMAT;
        }
      }
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
    }

    hydrated.value = true;
    rebuildUndoChain();
    await refreshUsage();

    if (legacy && !drafts.value.length) {
      // 旧格式（无信封）首次载入：重写为带修订号的新格式，失败则挂迁移草稿。
      const candidate = snapshot();
      const outcome = await writeCandidate(candidate, candidate.revision);
      if (outcome.ok) {
        if (outcome.compacted.length) {
          const keep = new Set(outcome.compacted);
          versions.forEach((record) => { if (keep.has(record.id)) { record.before = []; record.compacted = true; } });
          rebuildUndoChain();
        }
        setSaveStatus('saved', '本地数据已迁移并同步');
      } else if (outcome.remote) {
        stashDraft('migrate', 'conflict', '迁移本地数据', '旧版数据格式升级', candidate, outcome.candidate, outcome.remote);
      } else {
        stashDraft('migrate', 'quota', '迁移本地数据', '旧版数据格式升级', candidate, outcome.candidate, null);
      }
    } else if (!drafts.value.length) {
      setSaveStatus('saved', '本地数据已同步');
    }
  }

  function exportPackage() {
    return JSON.stringify({ exportedAt: now(), ...persistableSnapshot.value }, null, 2);
  }

  return {
    tabId, revision, entries, versions, audit, selectedId, hydrated, query, statusFilter, dialectFilter, fieldReplyDrafts,
    selectedEntry, filteredEntries, dialects, duplicates, openComments, persistableSnapshot,
    canUndo: computed(() => undoStack.value.length > 0), canRedo: computed(() => redoStack.value.length > 0),
    saveStatus, usage, lastCompactedIds, drafts, activeDraft, draftsOpen,
    createEntry, updateField, setStatus, addVariant, updateVariant, removeVariant, addExample, updateExample, removeExample,
    addSource, updateSource, removeSource, setSynonyms, addComment, replyComment, toggleComment, deleteEntry, mergeEntries,
    undo, redo, restoreVersion, canRestoreVersion, pinVersion, unpinVersion, compactNow,
    retryDraft, discardDraft, setDraftResolution,
    hydrateFromBrowser, refreshUsage, ingestExternalSave, exportPackage
  };
});
