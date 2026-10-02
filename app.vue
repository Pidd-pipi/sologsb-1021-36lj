<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDictionaryStore } from '~/store/dictionary';
import { STORAGE_KEY } from '~/utils/storage';
import type { DictionarySnapshot } from '~/types/dictionary';

const store = useDictionaryStore();
const { conflictRevision, lastError, failedCommit } = storeToRefs(store);
let stopPersistence: (() => void) | undefined;

const onStorage = (event: StorageEvent) => {
  if (event.key !== STORAGE_KEY) return;
  if (!event.newValue) return;
  try {
    const incoming = JSON.parse(event.newValue) as DictionarySnapshot;
    if (incoming.revision > store.revision) {
      conflictRevision.value = incoming.revision;
    }
  } catch {
    /* 忽略解析失败的 storage 事件 */
  }
};

onMounted(() => {
  store.hydrateFromBrowser();
  stopPersistence = watch(
    () => store.persistableSnapshot,
    (value) => {
      if (store.hydrated) store.persistSnapshot(value);
    },
    { deep: true }
  );
  window.addEventListener('storage', onStorage);
});

onBeforeUnmount(() => {
  stopPersistence?.();
  window.removeEventListener('storage', onStorage);
});
</script>

<template>
  <div class="app-root">
    <Transition name="banner">
      <div v-if="conflictRevision" class="banner banner-conflict">
        <strong>检测到另一标签页保存了更新的修订 r{{ conflictRevision }}</strong>
        <span>为避免覆盖，本页已停止写入。请重新载入以合并最新修订。</span>
        <t-button size="small" theme="warning" @click="store.reloadFromStorage">重新载入</t-button>
        <button class="banner-close" @click="store.dismissConflict">×</button>
      </div>
    </Transition>
    <Transition name="banner">
      <div v-if="lastError && !conflictRevision" class="banner banner-error">
        <strong>{{ lastError.type === 'quota' ? '存储预算不足' : '存储错误' }}</strong>
        <span>{{ lastError.message }}</span>
        <t-button v-if="failedCommit" size="small" theme="danger" @click="store.retryFailedCommit">重试提交</t-button>
        <t-button size="small" variant="outline" @click="store.compressStorage">立即压缩</t-button>
        <button class="banner-close" @click="store.dismissError">×</button>
      </div>
    </Transition>
    <NuxtPage />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  font-size: 13px;
  border-bottom: 1px solid transparent;
}
.banner strong {
  font-weight: 600;
}
.banner span {
  flex: 1;
  opacity: 0.85;
}
.banner .t-button {
  flex: none;
}
.banner-conflict {
  background: #fff7e6;
  border-color: #ffd591;
  color: #ad4e00;
}
.banner-error {
  background: #fff1f0;
  border-color: #ffa39e;
  color: #a8071a;
}
.banner-close {
  flex: none;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
}
.banner-close:hover {
  opacity: 1;
}
.banner-enter-active,
.banner-leave-active {
  transition: all 0.25s ease;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
