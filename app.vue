<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';

const store = useDictionaryStore();

const onStorage = (event: StorageEvent) => store.ingestExternalSave(event);

onMounted(() => {
  void store.hydrateFromBrowser();
  // 另一标签页写入时合并其新修订，而不是等本页保存时互相覆盖。
  window.addEventListener('storage', onStorage);
});

onBeforeUnmount(() => window.removeEventListener('storage', onStorage));
</script>

<template>
  <NuxtPage />
</template>
