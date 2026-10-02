<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import EntrySidebar from '~/components/EntrySidebar.vue';
import EntryEditor from '~/components/EntryEditor.vue';
import ReviewPanel from '~/components/ReviewPanel.vue';
import DuplicateMergeDialog from '~/components/DuplicateMergeDialog.vue';
import DeleteImpactDialog from '~/components/DeleteImpactDialog.vue';
import VersionDrawer from '~/components/VersionDrawer.vue';
import PendingDraftDialog from '~/components/PendingDraftDialog.vue';
import { useDictionaryStore } from '~/store/dictionary';
import { referencesToEntry } from '~/utils/dictionary';
import { formatBytes } from '~/utils/storage';
import type { DictionaryEntry, SaveStatusKind } from '~/types/dictionary';

const store = useDictionaryStore();
const duplicateOpen = ref(false);
const versionsOpen = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref<DictionaryEntry | null>(null);

const impacts = computed(() => deleteTarget.value ? referencesToEntry(store.entries, deleteTarget.value) : []);

const statusTheme: Record<SaveStatusKind, string> = {
  saved: 'saved', saving: 'saving', quota: 'warning', conflict: 'warning', unavailable: 'warning'
};

const openDelete = () => {
  deleteTarget.value = store.selectedEntry ?? null;
  deleteOpen.value = true;
};

const confirmDelete = async () => {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.headword;
  const ok = await store.deleteEntry(deleteTarget.value.id);
  deleteOpen.value = false;
  if (ok) MessagePlugin.success(`已删除“${name}”，可在版本记录中恢复`);
  else MessagePlugin.warning(store.saveStatus.message);
};

const openDuplicates = () => {
  if (!store.duplicates.length) {
    MessagePlugin.info('当前没有检测到高度相似的重复词条');
    return;
  }
  duplicateOpen.value = true;
};

const exportData = () => {
  const blob = new Blob([store.exportPackage()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `濒危语言词典备份-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const moveEntry = (delta: number) => {
  const list = store.filteredEntries;
  const index = list.findIndex((entry) => entry.id === store.selectedId);
  const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
  if (next) store.selectedId = next.id;
};

const keyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  const editing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportData(); return; }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); store.createEntry(); return; }
  if (editing) return;
  if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('.entry-sidebar input')?.focus(); }
  if (event.key.toLowerCase() === 'j') { event.preventDefault(); moveEntry(1); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); moveEntry(-1); }
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); openDuplicates(); }
  if (event.key.toLowerCase() === 'v') { event.preventDefault(); versionsOpen.value = true; }
};

onMounted(() => window.addEventListener('keydown', keyboard));
onBeforeUnmount(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-seal">语</div><div><h1>濒危语言词典编辑与审校</h1><p>ENDANGERED LANGUAGE LEXICON WORKBENCH</p></div></div>
      <div class="offline-status" :class="statusTheme[store.saveStatus.kind]">
        <span class="online-dot" />
        <span>{{ store.saveStatus.message }}</span>
        <button v-if="store.drafts.length" class="retry-entry" @click="store.draftsOpen = true">待处理草稿（{{ store.drafts.length }}）·点击重试</button>
      </div>
      <div class="top-actions">
        <t-button variant="text" theme="default" :disabled="!store.canUndo" @click="store.undo">撤销</t-button>
        <t-button variant="text" theme="default" :disabled="!store.canRedo" @click="store.redo">重做</t-button>
        <t-button variant="outline" theme="default" @click="exportData">导出备份</t-button>
        <t-button theme="primary" @click="store.createEntry">＋ 新建词条</t-button>
      </div>
    </header>

    <section class="project-bar">
      <div><span class="eyebrow">COMMUNITY DICTIONARY · 离线工作区</span><h2>词汇整理与审校</h2><p>从田野记录到确认词条，逐字段保留修改依据、审校回复和版本历史。</p></div>
      <div class="project-stats">
        <div><strong>{{ store.entries.length }}</strong><span>词条</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'review').length }}</strong><span>待审</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'disputed').length }}</strong><span>争议</span></div>
        <div><strong>{{ store.openComments }}</strong><span>待回复意见</span></div>
        <div><strong>{{ store.duplicates.length }}</strong><span>疑似重复</span></div>
      </div>
    </section>

    <main class="workspace">
      <EntrySidebar @create="store.createEntry" @duplicates="openDuplicates" @versions="versionsOpen = true" />
      <EntryEditor />
      <ReviewPanel @versions="versionsOpen = true" />
    </main>

    <section class="bottom-bar">
      <div class="method-card"><span class="method-index">01</span><div><strong>字段级审校</strong><p>审校意见绑定到词形、发音、释义、例句或来源，编辑可逐条回复并解决。</p></div></div>
      <div class="method-card"><span class="method-index">02</span><div><strong>引用影响检查</strong><p>删除词条前扫描同义词、释义和例句引用，列出可能受影响的全部词条。</p></div></div>
      <div class="method-card"><span class="method-index">03</span><div><strong>离线版本保护</strong><p>提交前先估算存储预算；容量不足整笔撤回并保留草稿，旧快照按固定规则压缩。</p></div></div>
      <div class="keyboard-card"><kbd>J/K</kbd><span>切换词条</span><kbd>/</kbd><span>搜索</span><kbd>D</kbd><span>查重</span><kbd>V</kbd><span>版本</span></div>
    </section>

    <footer class="footer-bar">
      <span>当前修订 r{{ store.revision }} · {{ store.hydrated ? '浏览器本地保存已启用' : '正在载入本地数据' }} · 存储 {{ formatBytes(store.usage.used) }}/{{ formatBytes(store.usage.quota) }}</span>
      <button v-if="store.selectedEntry" class="delete-link" @click="openDelete">删除当前词条并检查引用</button>
    </footer>

    <ClientOnly>
      <DuplicateMergeDialog v-model="duplicateOpen" :pairs="store.duplicates" />
      <DeleteImpactDialog v-model="deleteOpen" :entry="deleteTarget" :impacts="impacts" @confirm="confirmDelete" />
      <VersionDrawer v-model="versionsOpen" />
      <PendingDraftDialog />
    </ClientOnly>
  </div>
</template>

<style scoped>
.offline-status.saved .online-dot { background: #75d7a4; box-shadow: 0 0 0 4px rgba(117, 215, 164, .12); }
.offline-status.saving .online-dot { background: #e3c37e; box-shadow: 0 0 0 4px rgba(227, 195, 126, .18); }
.offline-status.warning .online-dot { background: #e08a52; box-shadow: 0 0 0 4px rgba(224, 138, 82, .16); }
.retry-entry { margin-left: 8px; padding: 2px 8px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 9px; color: #ffd9a8; background: transparent; font-size: 10px; cursor: pointer; }
.retry-entry:hover { background: rgba(255, 255, 255, .12); }
</style>
