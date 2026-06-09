<script setup>
const props = defineProps({
  name:   { type: String, required: true },
  size:   { type: Number, default: 20 },
  stroke: { type: String, default: 'currentColor' },
  sw:     { type: Number, default: 1.8 },
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 20 20">
    <template v-if="name === 'refresh'">
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M3 10a7 7 0 0 1 12-4.5L17 7" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M17 3v4h-4" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M17 10a7 7 0 0 1-12 4.5L3 13" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M3 17v-4h4" />
    </template>

    <template v-else-if="name === 'plus'">
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M10 4v12M4 10h12" />
    </template>

    <template v-else-if="name === 'search'">
      <circle :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" cx="9" cy="9" r="6" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M14 14l4 4" />
    </template>

    <template v-else-if="name === 'grip'">
      <circle cx="7" cy="6" r="1.3" :fill="stroke" />
      <circle cx="13" cy="6" r="1.3" :fill="stroke" />
      <circle cx="7" cy="10" r="1.3" :fill="stroke" />
      <circle cx="13" cy="10" r="1.3" :fill="stroke" />
      <circle cx="7" cy="14" r="1.3" :fill="stroke" />
      <circle cx="13" cy="14" r="1.3" :fill="stroke" />
    </template>

    <template v-else-if="name === 'trash'">
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
    </template>

    <template v-else-if="name === 'share'">
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M10 3v9" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M6.5 6.5L10 3l3.5 3.5" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M6 9H4.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H14" />
    </template>

    <template v-else-if="name === 'external'">
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M9 5H5.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H14a1 1 0 0 0 1-1V11" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M11.5 4.5H15.5V8.5" />
      <path :stroke="stroke" :stroke-width="sw" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M15.5 4.5l-6 6" />
    </template>
  </svg>
</template>
