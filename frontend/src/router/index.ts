import { createRouter, createWebHistory } from 'vue-router'
const Login=()=>import('../components/Login.vue')
const Home=()=>import('../components/Home.vue')
const Me=()=>import('../components/Me.vue')
const JourneyDetail=()=>import('../components/JourneyDetail.vue')
const AiDirectorStudio=()=>import('../components/AiDirectorStudio.vue')
const Discover=()=>import('../components/Discover.vue')
const AuthorProfile=()=>import('../components/AuthorProfile.vue')
const CollabJourneyPreview=()=>import('../components/CollabJourneyPreview.vue')

/**
 * 页面结构：
 * /login        登录 / 注册
 * /home         首页：随机旅行照片展示
 * /me           我的：个人空间
 * /journey/:id  某次旅行详情
 */
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path !== from.path) return { top: 0 }
  },
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/login', name: 'Login', component: Login },
    {
      path: '/home',
      name: 'Home',
      component: Home,
      meta: { requiresAuth: true, navGroup: 'home' }
    },
    {
      path: '/discover',
      name: 'Discover',
      component: Discover,
      meta: { requiresAuth: true, navGroup: 'discover' }
    },
    {
      path: '/author/:id',
      name: 'AuthorProfile',
      component: AuthorProfile,
      meta: { requiresAuth: true, navGroup: 'discover' }
    },
    { path: '/social-hub', redirect: to => ({path:'/me',query:{...to.query,section:to.query.tab === 'friends'?'friends':'messages',...(to.query.user?{type:'private'}:{})}}) },
    {
      path: '/me',
      name: 'Me',
      component: Me,
      meta: { requiresAuth: true, navGroup: 'me' }
    },
    { path: '/collab/journey/:id', name: 'CollabJourneyPreview', component: CollabJourneyPreview, meta: { requiresAuth: true, navGroup: 'me' } },
    {
      path: '/journey/:id',
      name: 'JourneyDetail',
      component: JourneyDetail,
      meta: { requiresAuth: true, navGroup: 'me' }
    },
    { path: '/journey/:id/director', name: 'AiDirectorStudio', component: AiDirectorStudio, meta: { requiresAuth: true, navGroup: 'me' } },
    { path: '/film/:token', name: 'PublicTravelFilm', component: () => import('../components/PublicTravelFilm.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/home' }
  ]
})

export function loginDestination(redirect: unknown): string {
  if (
    typeof redirect !== 'string' ||
    !redirect.startsWith('/') ||
    redirect.startsWith('//') ||
    redirect.includes('\\')
  ) {
    return '/home'
  }
  const destination = router.resolve(redirect)
  return destination.meta.requiresAuth ? destination.fullPath : '/home'
}

/**
 * JWT 前端路由守卫。
 *
 * travel_user：
 * 页面展示用的用户资料。
 *
 * travel_token：
 * 后端签发的 JWT。
 *
 * 两者必须同时存在，前端才认为当前有登录状态。
 *
 * 注意：
 * 这里主要用于页面跳转体验。
 * 真正的安全校验仍然由 Spring Boot 的 AuthInterceptor 完成。
 */
router.beforeEach((to) => {
  const savedUser =
    localStorage.getItem('travel_user')

  const token =
    localStorage.getItem('travel_token')

  const hasLoginSession =
    Boolean(savedUser && token)

  /**
   * 如果两个状态不完整，
   * 顺手清理残留数据，避免“半登录”状态。
   */
  if (!hasLoginSession) {
    localStorage.removeItem('travel_user')
    localStorage.removeItem('travel_token')
  }

  if (
    to.meta.requiresAuth
    && !hasLoginSession
  ) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  if (
    to.path === '/login'
    && hasLoginSession
  ) {
    return loginDestination(to.query.redirect)
  }

  return true
})

export default router
