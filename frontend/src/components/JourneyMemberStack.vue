<template>
  <!-- TRAVEL_SOCIAL_V121: show actual author name -->
  <div v-if="members.length" class="member-stack" :aria-label="memberLabel" :title="memberLabel" @click.stop>
    <div v-for="member in members.slice(0, 4)" :key="member.userId" class="member-avatar">
      <UserAvatar :user-id="Number(member.userId)" :avatar="member.avatar" :name="member.nickname || member.username" :size="31" />
    </div>
    <span v-if="members.length > 4" class="member-more">+{{ members.length - 4 }}</span>
    <span class="collab-tag">{{ members.length > 1 ? (members[0]?.nickname || members[0]?.username || '作者') + ' 等人共创' : (members[0]?.nickname || members[0]?.username || '作者') }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import UserAvatar from './UserAvatar.vue'
import type { CollabMember } from '@/api/collab'
const props = defineProps<{ members: CollabMember[] }>()
const memberLabel = computed(() => props.members.map((m, i) => `${i === 0 ? '创建者' : '同行者'}：${m.nickname || m.username}`).join('、'))
</script>
<style scoped>
.member-stack{position:absolute;z-index:4;left:12px;bottom:12px;display:flex;align-items:center;padding:5px 9px 5px 7px;max-width:calc(100% - 24px);border:1px solid rgba(255,255,255,.68);border-radius:999px;background:rgba(255,246,251,.77);backdrop-filter:blur(12px);box-shadow:0 8px 22px rgba(91,50,83,.17);white-space:nowrap}
.member-avatar{margin-left:-7px}.member-avatar:first-child{margin-left:0}.member-more{font-size:11px;font-weight:800;color:#965679;margin-left:7px}.collab-tag{margin-left:8px;font-size:10px;font-weight:700;color:#a15e80}
</style>
