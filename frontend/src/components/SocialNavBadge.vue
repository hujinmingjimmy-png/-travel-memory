<template><b v-if="total" class="social-nav-badge">{{total>99?'99+':total}}</b></template>
<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref} from 'vue'
import {hubCounts,type HubCounts} from '@/api/socialHub'
const total=ref(0);let timer:number|undefined
async function refresh(){try{const r=await hubCounts();if(r.code===200){const d=r.data;total.value=d.notifications+d.friendRequests+d.messages}}catch{}}
function sync(e:Event){const d=(e as CustomEvent<HubCounts>).detail;if(d)total.value=d.notifications+d.friendRequests+d.messages}
onMounted(()=>{window.addEventListener('tm-social-counts',sync);void refresh();timer=window.setInterval(refresh,15000)})
onBeforeUnmount(()=>{window.removeEventListener('tm-social-counts',sync);if(timer)window.clearInterval(timer)})
</script>
<style scoped>.social-nav-badge{display:inline-block;float:right;background:#ffcbdf;color:#914d73;border-radius:16px;min-width:17px;text-align:center;padding:1px 5px;font-size:10px}</style>
