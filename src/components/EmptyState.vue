<script setup>
import Icon from './Icon.vue';
defineEmits(['add']);
</script>

<template>
  <div class="empty">
    <div class="empty-radar">
      <span class="er-ring er-r1" />
      <span class="er-ring er-r2" />
      <span class="er-ring er-r3" />
      <span class="er-sweep" />
      <span class="er-core" />
      <span class="er-blip er-b1" />
      <span class="er-blip er-b2" />
    </div>
    <h2 class="empty-title">開始追蹤回檔</h2>
    <p class="empty-sub">
      加入你的台股自選清單，<br />
      即時掌握距 3 年高點的回檔幅度，<br />
      與下一個關鍵關卡價位。
    </p>
    <button class="empty-cta" @click="$emit('add')">
      <Icon name="plus" :size="20" :sw="2.2" stroke="#fff" />
      新增第一支股票
    </button>
    <div class="empty-hint">支援代號或名稱搜尋・無上限</div>
  </div>
</template>
