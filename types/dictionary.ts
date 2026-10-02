export type EntryStatus = 'draft' | 'review' | 'disputed' | 'confirmed';

export interface DialectVariant {
  id: string;
  dialect: string;
  form: string;
  pronunciation: string;
  note: string;
}

export interface ExampleSentence {
  id: string;
  text: string;
  translation: string;
  source: string;
}

export interface DictionarySource {
  id: string;
  title: string;
  citation: string;
  url: string;
}

export interface ReviewComment {
  id: string;
  field: string;
  author: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  replies: Array<{ id: string; author: string; message: string; createdAt: string }>;
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  synonyms: string[];
  status: EntryStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  reviewerComments: ReviewComment[];
}

export interface VersionRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryId?: string;
  /** 该版本对应的修订号，用于撤销链重算与跨标签页合并排序。 */
  revision?: number;
  /** 提交前的完整词条快照；被压缩的旧版本为空数组，只能浏览时间线、不能恢复。 */
  before: DictionaryEntry[];
  /** 编辑标记的关键版本，压缩存储时永远保留完整快照。 */
  pinned?: boolean;
  /** 已按存储预算压缩：时间线条目仍在，完整快照已丢弃。 */
  compacted?: boolean;
}

export interface AuditRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryIds: string[];
}

export interface DictionarySnapshot {
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
}

export interface DuplicatePair {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
}

export type SaveStatusKind = 'saved' | 'saving' | 'quota' | 'conflict' | 'unavailable';

export interface SaveStatus {
  kind: SaveStatusKind;
  message: string;
}

export interface StorageUsage {
  /** 本来源 localStorage 已用字节（估算）。 */
  used: number;
  /** 本来源配额总量（估算）。 */
  quota: number;
  /** 剩余可用字节（估算）。 */
  headroom: number;
  /** 已用比例 0~1。 */
  ratio: number;
  /** 主数据键当前占用字节。 */
  mainBytes: number;
}

export type PendingConflictKind = 'modified' | 'deleted-remote' | 'deleted-local';
export type PendingConflictChoice = 'remote' | 'local';

export interface PendingConflict {
  entryId: string;
  headword: string;
  kind: PendingConflictKind;
  /** 本页离线改动对应的词条；远端删除时为 null。 */
  local: DictionaryEntry | null;
  /** 另一标签页新修订对应的词条；本页执行删除时为 null。 */
  remote: DictionaryEntry | null;
  resolution: PendingConflictChoice | null;
}

/** 未能写入浏览器的整笔提交，作为可重试草稿保留（内存 + 独立 localStorage 键）。 */
export interface PendingDraft {
  id: string;
  tabId: string;
  kind: 'commit' | 'pin' | 'compact' | 'init' | 'migrate';
  reason: 'quota' | 'conflict';
  action: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  /** 草稿所基于的已持久化快照（三方合并的共同祖先）。 */
  base: DictionarySnapshot;
  /** 本页期望写入的完整快照。 */
  candidate: DictionarySnapshot;
  /** 压缩前标记过的关键版本 id。 */
  pinnedMeta: string[];
  conflicts: PendingConflict[];
}
