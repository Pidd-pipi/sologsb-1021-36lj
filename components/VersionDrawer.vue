<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDictionaryStore } from '~/store/dictionary';

const visible = defineModel<boolean>({ required: true });
const store = useDictionaryStore();
const { selectedVersionId, storageUsed, storageBudget, storageRatio } = storeToRefs(store);
const revisions = computed(() => store.versions);
const diff = (before: typeof store.entries) => {
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

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const compressNow = () => {
  store.compressStorage();
};
</script>

<template>
  <t-drawer v-model:visible="visible" header="版本记录" size="560px" :footer="false">
    <div class="version-drawer">
      <div class="version-intro">
        <strong>{{ revisions.length }}</strong><span>个可恢复版本</span>
        <p>每次字段编辑、状态变更、合并或删除都会在提交前保存完整快照。</p>
      </div>

      <div class="storage-panel">
        <div class="storage-head">
          <strong>存储预算</strong>
          <span>{{ formatBytes(storageUsed) }} / {{ formatBytes(storageBudget) }}</span>
        </div>
        <div class="storage-bar"><div class="storage-fill" :class="{ over: storageRatio >= 1 }" :style="{ width: `${Math.round(storageRatio * 100)}%` }" /></div>
        <div class="storage-actions">
          <span class="storage-hint">固定关键版本后，压缩存储会保留最早恢复点与已固定版本。</span>
          <t-button size="small" variant="outline" @click="compressNow">立即压缩</t-button>
        </div>
      </div>

      <div class="version-list">
        <article
          v-for="version in revisions"
          :key="version.id"
          class="version-item"
          :class="{ selected: selectedVersionId === version.id, pinned: version.pinned }"
          @click="selectedVersionId = version.id"
        >
          <div class="version-line">
            <span class="version-dot" />
            <time>{{ new Date(version.at).toLocaleString('zh-CN') }}</time>
            <t-tag v-if="version.pinned" size="small" theme="warning" variant="light">关键版本</t-tag>
          </div>
          <strong>{{ version.action }}</strong>
          <p>{{ version.detail }}</p>
          <div class="diff-line"><span>新增 {{ diff(version.before).added }}</span><span>修改 {{ diff(version.before).changed }}</span><span>删除 {{ diff(version.before).removed }}</span></div>
          <div class="version-actions">
            <t-button size="small" variant="outline" @click.stop="store.restoreVersion(version.id); visible = false">恢复到此版本</t-button>
            <t-button v-if="version.pinned" size="small" variant="text" @click.stop="store.unpinVersion(version.id)">取消固定</t-button>
            <t-button v-else size="small" variant="text" @click.stop="store.pinVersion(version.id)">固定为关键版本</t-button>
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
