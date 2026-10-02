<script setup lang="ts">
import { computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useDictionaryStore } from '~/store/dictionary';
import { formatBytes, serializedBytes } from '~/utils/storage';

const store = useDictionaryStore();

const draft = computed(() => store.activeDraft);
const visible = computed({
  get: () => !!draft.value && store.draftsOpen,
  set: (value) => {
    // 关闭弹窗只是收起入口，草稿仍保留在浏览器中，可随时从顶部横幅重新打开。
    store.draftsOpen = value;
  }
});

const kindText = {
  modified: '双方都修改了该词条',
  'deleted-local': '本页删除，另一标签页已修改',
  'deleted-remote': '本页修改，另一标签页已删除'
} as const;

const isQuota = computed(() => draft.value?.reason === 'quota');
const unresolvedCount = computed(() => draft.value?.conflicts.filter((item) => item.resolution === null).length ?? 0);
const canRetry = computed(() => draft.value !== null && (isQuota.value || unresolvedCount.value === 0));

const choose = (entryId: string, resolution: 'local' | 'remote') => {
  if (!draft.value) return;
  store.setDraftResolution(draft.value.id, entryId, resolution);
};

const retry = async () => {
  if (!draft.value || !canRetry.value) return;
  const ok = await store.retryDraft(draft.value.id);
  if (ok) MessagePlugin.success('未保存改动已重试并写入本地');
  else MessagePlugin.warning(store.saveStatus.message);
};

const exportDraft = () => {
  if (!draft.value) return;
  const blob = new Blob([JSON.stringify(draft.value.candidate, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `未保存草稿-${draft.value.action}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <t-dialog
    v-if="draft"
    v-model:visible="visible"
    :header="isQuota ? '存储空间不足，改动已整笔撤回' : '检测到另一标签页的新修订'"
    :confirm-btn="{ content: isQuota ? '重试写入' : '合并并重试', disabled: !canRetry }"
    cancel-btn="稍后处理"
    :close-on-overlay-click="false"
    @confirm="retry"
  >
    <div class="draft-dialog">
      <p class="draft-line">
        <t-tag size="small" :theme="isQuota ? 'warning' : 'danger'" variant="light">{{ isQuota ? '容量不足' : '修订冲突' }}</t-tag>
        <strong>{{ draft.action }}</strong>
      </p>
      <p class="draft-detail">{{ draft.detail }}</p>
      <p class="draft-detail">草稿形成于 {{ new Date(draft.createdAt).toLocaleString('zh-CN') }}，本页编辑已回滚到上一个已保存状态；草稿会保存在浏览器中，可随时重试。</p>

      <template v-if="isQuota">
        <div class="quota-box">
          <div class="quota-row">
            <span>本次数据约需</span>
            <strong>{{ formatBytes(serializedBytes(draft.candidate)) }}</strong>
          </div>
          <div class="quota-row">
            <span>配额总量 / 已用</span>
            <strong>{{ formatBytes(store.usage.quota) }} / {{ formatBytes(store.usage.used) }}</strong>
          </div>
          <p class="draft-detail">重试时会自动丢弃未固定的旧快照（保留最早恢复点与已固定关键版本）；仍放不下时可先在版本记录中“压缩”或“导出备份”，再回到这里重试。</p>
        </div>
      </template>

      <template v-else>
        <p v-if="!draft.conflicts.length" class="draft-detail">两处改动作用于不同词条，将自动三方合并，不会覆盖另一标签页的修订。</p>
        <article v-for="conflict in draft.conflicts" :key="conflict.entryId" class="conflict-card">
          <header>
            <strong>{{ conflict.headword }}</strong>
            <span>{{ kindText[conflict.kind] }}</span>
          </header>
          <div class="conflict-choices">
            <button
              class="conflict-choice"
              :class="{ picked: conflict.resolution === 'remote' }"
              @click="choose(conflict.entryId, 'remote')"
            >
              <span class="choice-label">保留另一标签页版本</span>
              <small>{{ conflict.remote ? `修订于 ${new Date(conflict.remote.updatedAt).toLocaleString('zh-CN')}` : '以删除为准' }}</small>
            </button>
            <button
              class="conflict-choice"
              :class="{ picked: conflict.resolution === 'local' }"
              @click="choose(conflict.entryId, 'local')"
            >
              <span class="choice-label">保留本页草稿</span>
              <small>{{ conflict.local ? `编辑于 ${new Date(conflict.local.updatedAt).toLocaleString('zh-CN')}` : '以删除为准' }}</small>
            </button>
          </div>
        </article>
        <p v-if="unresolvedCount" class="draft-detail warn">还有 {{ unresolvedCount }} 处冲突需要选择保留哪一侧。</p>
      </template>

      <div class="draft-actions">
        <t-button variant="text" size="small" @click="exportDraft">导出草稿 JSON</t-button>
        <t-button variant="text" size="small" @click="store.compactNow()">先压缩旧版本</t-button>
        <t-popconfirm theme="danger" content="放弃后这笔未保存改动将永久丢失，确定吗？" @confirm="draft && store.discardDraft(draft.id)">
          <t-button variant="text" size="small" theme="danger">放弃这笔草稿</t-button>
        </t-popconfirm>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>
.draft-line { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
.draft-detail { margin: 6px 0; color: #667973; font-size: 12px; line-height: 1.6; }
.draft-detail.warn { color: #b4773f; }
.quota-box { margin-top: 10px; padding: 12px; border-radius: 8px; background: #fbf5ea; }
.quota-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
.quota-row strong { color: #1f6254; }
.conflict-card { margin: 10px 0; padding: 10px; border: 1px solid #e2ddd2; border-radius: 8px; background: #fcfaf5; }
.conflict-card header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.conflict-card header span { color: #9a6a35; font-size: 11px; }
.conflict-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.conflict-choice { display: flex; flex-direction: column; gap: 2px; padding: 8px; border: 1px solid #d8ded9; border-radius: 7px; background: white; text-align: left; cursor: pointer; }
.conflict-choice small { color: #8a9792; font-size: 10px; }
.conflict-choice.picked { border-color: #276c5e; background: #eef6f3; box-shadow: inset 0 0 0 1px #276c5e; }
.choice-label { font-size: 12px; font-weight: 700; color: #334842; }
.draft-actions { display: flex; gap: 4px; margin-top: 12px; }
</style>
