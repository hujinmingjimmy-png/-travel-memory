<template>
  <header class="global-header">
    <RouterLink class="brand" to="/home"><span class="brand-mark" aria-hidden="true">✧</span><strong>Travel Memory<small>漫步旅行</small></strong></RouterLink>
    <nav aria-label="主导航">
      <RouterLink v-for="item in items" :key="item.group" :to="item.to" :class="{active: group === item.group}" :aria-current="group === item.group ? 'page' : undefined">{{ item.label }}</RouterLink>
    </nav>
    <RouterLink class="create tm-action" aria-label="创建旅行" :to="{path:'/me',query:{create:'1'}}">＋ <span>创建旅行</span></RouterLink>
  </header>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {RouterLink,useRoute} from 'vue-router'
const route=useRoute()
const group=computed(()=>route.meta.navGroup || 'me')
const items=[{group:'home',to:'/home',label:'首页'},{group:'discover',to:'/discover',label:'发现'},{group:'me',to:'/me',label:'我的'}]
</script>
<style scoped>
.global-header{position:sticky;top:0;z-index:100;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(8px,2vw,22px);min-height:var(--tm-nav-height);padding:8px var(--tm-gutter);background:var(--tm-sheet);border-bottom:1px solid var(--tm-line);color:var(--tm-ink)}
.brand{display:flex;align-items:center;gap:9px;width:max-content;color:inherit;text-decoration:none;white-space:nowrap}
.brand-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--tm-accent);border-radius:50%;color:var(--tm-accent);font-size:1.38rem}
.brand strong{font:700 1.22rem/1.05 var(--tm-display)}
.brand small{display:block;margin-top:3px;color:var(--tm-muted);font:600 .6rem/1.1 system-ui,sans-serif;letter-spacing:.22em}
nav{display:flex;align-items:center;gap:clamp(4px,1.3vw,18px)}
nav a{display:grid;place-items:center;min-height:44px;padding:0 clamp(8px,1vw,15px);border-bottom:2px solid transparent;text-decoration:none;color:var(--tm-muted);white-space:nowrap;font-size:.9rem}
nav a.active,nav a:hover{color:var(--tm-accent);border-bottom-color:currentColor}
nav a.active{font-weight:750}
.create{justify-self:end;white-space:nowrap}
@media(max-width:650px){
 .global-header{padding-inline:10px;gap:4px}
 .brand-mark{width:27px;height:27px;font-size:1rem}
 .brand strong{font-size:.95rem}.brand small{font-size:.55rem}
 .create{min-width:42px;padding-inline:9px}
 .create span{display:none}
}
@media(max-width:390px){.brand-mark{display:none}.brand strong{font-size:.88rem}nav a{padding-inline:8px;font-size:.82rem}}
</style>
