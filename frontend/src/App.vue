<template>
  <GlobalNav v-if="route.meta.requiresAuth" />
  <router-view v-slot="{ Component }">
    <Transition name="tm-page">
      <component :is="Component" />
    </Transition>
  </router-view>
</template>
<script setup lang="ts">
import {useRoute} from 'vue-router'
import GlobalNav from './components/GlobalNav.vue'
const route=useRoute()
</script>
<style>
:root{--tm-nav-height:72px}html{scroll-padding-top:calc(var(--tm-nav-height) + 14px)}@media(max-width:650px){:root{--tm-nav-height:64px}}
</style>
