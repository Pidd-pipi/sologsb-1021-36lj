<script setup lang="ts">
import { computed } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import { formatBytes } from '~/utils/storage';

const visible = defineModel<boolean>({ required: true });
const store = useDictionaryStore();
const revisions = computed(() => store.versions);
const fullCount = computed(() => revisions.value.filter((version) => !version.compacted && version.before.length).length);
const pinnedCount = computed(() => revisions.value.filter((version) => version.pinned).length);

const diff = (before: typeof store.entries) => {
  if (!before.length) return null;
  const beforeMap = new Map(before.map((entry) => [entry.id, entry]));
  const afterMap = new Map(store.entries.map((entry) => [entry.id, entry]));
  let changed = 0;
  afterMap.forEach((entry, id) => {
    const old = beforeMap.get(id);
    if (!old || JSON.stringify(old) !== JSON.stringify(entry)) changed += 1;
  });
  const removed = before.filter((entry) => !afterMap.has(entry.id)).length;
  return { changed, removed, added: store.entries.filter((entry) => !beforeMap.has(entry.id)).length };
};

const usagePct = computed(() => `${Math.round(store.usage.ratio * 100)}%`);
const usageTheme = computed(() => (store.usage.ratio > 0.9 ? 'danger' : store.usage.ratio > 0.7 ? 'warning' : 'success'));
</script>

<template>
  <t-drawer v-model:visible="visible" header="版本记录" size="560px" :footer="false">
    <div class="version-drawer">
      <div class="version-intro">
        <div class="intro-top"><strong>{{ revisions.length }}</strong><span>个版本 · {{ fullCount }} 个可恢复 · {{ pinnedCount }} 个已固定</span></div>
        <p>空间不足时未固定的旧快照会被压缩（时间线保留）；最早恢复点与固定的关键版本永远保留完整数据。</p>
        <div class="storage-budget">
          <div class="budget-row">
            <span>本地存储占用 {{ usagePct }}</span>
            <span>{{ formatBytes(store.usage.used) }} / {{ formatBytes(store.usage.quota) }}</span>
          </div>
          <t-progress :percentage="Math.round(store.usage.ratio * 100)" :theme="usageTheme" :stroke-width="6" />
          <div class="budget-row sub"><span>工作区数据 {{ formatBytes(store.usage.mainBytes) }}</span><span>剩余约 {{ formatBytes(store.usage.headroom) }}</span></div>
          <t-button size="small" variant="outline" class="compact-btn" @click="store.compactNow()">立即压缩未固定旧快照</t-button>
        </div>
      </div>
      <div class="version-list">
        <article v-for="version in revisions" :key="version.id" class="version-item" :class="{ pinned: version.pinned, compacted: version.compacted }">
          <div class="version-line">
            <span class="version-dot" />
            <time>{{ new Date(version.at).toLocaleString('zh-CN') }}</time>
            <t-tag v-if="version.pinned" size="small" theme="success" variant="light">关键版本</t-tag>
            <t-tag v-else-if="version.compacted" size="small" theme="default" variant="light">快照已压缩</t-tag>
          </div>
          <strong>{{ version.action }}</strong>
          <p>{{ version.detail }}</p>
          <div v-if="diff(version.before)" class="diff-line"><span>新增 {{ diff(version.before)!.added }}</span><span>修改 {{ diff(version.before)!.changed }}</span><span>删除 {{ diff(version.before)!.removed }}</span></div>
          <p v-else class="compacted-note">完整快照已按存储预算丢弃，该条目仅保留时间线，无法直接恢复；可恢复其之后的版本或使用导出备份。</p>
          <div class="version-actions">
            <t-button
              size="small"
              variant="outline"
              :disabled="!store.canRestoreVersion(version.id)"
              @click="store.restoreVersion(version.id); visible = false"
            >{{ store.canRestoreVersion(version.id) ? '恢复到此版本' : '快照不可用' }}</t-button>
            <t-button
              v-if="!version.compacted && version.before.length"
              size="small"
              variant="text"
              :theme="version.pinned ? 'default' : 'success'"
              @click="version.pinned ? store.unpinVersion(version.id) : store.pinVersion(version.id)"
            >{{ version.pinned ? '取消固定' : '☆ 固定为关键版本' }}</t-button>
          </div>
        </article>
        <t-empty v-if="!revisions.length" description="编辑词条后，版本记录会出现在这里" />
      </div>
      <div class="audit-section">
        <h3>最近操作</h3>
        <div v-for="item in store.audit.slice(0, 12)" :key="item.id" class="audit-line"><time>{{ new Date(item.at).toLocaleString('zh-CN') }}</time><div><strong>{{ item.action }}</strong><span>{{ item.detail }}</span></div></div>
      </div>
    </div>
  </t-drawer>
</template>

<style scoped>
.intro-top { display: flex; align-items: baseline; gap: 6px; }
.intro-top strong { font-family: "Songti SC", serif; font-size: 26px; color: var(--forest); }
.intro-top span { font-size: 11px; color: var(--muted); }
.storage-budget { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #c9d7d1; }
.budget-row { display: flex; justify-content: space-between; font-size: 10px; color: #5b716a; margin-bottom: 5px; }
.budget-row.sub { margin-top: 5px; margin-bottom: 0; color: #8a9792; }
.compact-btn { margin-top: 8px; }
.version-line { gap: 6px; flex-wrap: wrap; }
.version-item.pinned { border-color: #9bc8b6; background: #f6fbf8; }
.version-item.compacted { opacity: .92; }
.version-actions { display: flex; gap: 6px; }
.compacted-note { margin: 3px 0 7px; color: #948a72; font-size: 9px; }
</style>
