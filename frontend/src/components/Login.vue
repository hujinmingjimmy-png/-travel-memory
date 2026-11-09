<template>
  <main class="auth-page">
    <!--
      ★★★★★【可选粉色背景图】★★★★★
      public/images/login-pink-bg.jpg

      不放也可以，页面会使用粉色渐变背景。
    -->
    <div class="page-bg"></div>
    <div class="page-overlay"></div>

    <!-- 樱花 -->
    <div class="petal-layer" aria-hidden="true">
      <span
        v-for="petal in petals"
        :key="petal.id"
        class="petal"
        :style="{
          left: petal.left,
          animationDuration: petal.duration,
          animationDelay: petal.delay,
          '--petal-scale': petal.scale
        }"
      />
    </div>

    <section
      class="auth-shell"
      :class="{ 'register-mode': mode === 'register' }"
    >
      <!-- 登录框外发光 -->
      <div class="shell-glow"></div>

      <!-- 登录 -->
      <div class="form-panel login-panel">
        <!--
          ==========================================================
          ★★★★★【阿尼亚现在相对 login-panel 定位】★★★★★

          以后你只调整 CSS 中：
          .anya-hanger 的 top / left

          它就会始终跟着登录面板移动，
          不再相对整个 auth-shell 或浏览器窗口定位。
          ==========================================================
        -->
        <div class="anya-hanger">
          <span class="hanger-string"></span>

          <div class="anya-effects" aria-hidden="true">
            <span class="spark spark-1">✦</span>
            <span class="spark spark-2">✧</span>
            <span class="heart heart-1">♥</span>
            <span class="heart heart-2">♡</span>
            <span class="spark spark-3">✦</span>
          </div>

          <img
            class="anya-image"
            :src="showCoverEyes ? anyaCoverEyesSrc : anyaNormalSrc"
            alt="角色装饰"
          />
        </div>

        <div class="form-content">
          <div class="brand">
            <span class="brand-badge">✿</span>
            <span>Travel Memory</span>
          </div>

          <p class="eyebrow">WELCOME BACK</p>
          <h1>是风就该自由</h1>
          

          <p class="form-description">
            慢慢接受了所有，晚风吹人醒，万事藏于心
          </p>

          <form @submit.prevent="handleLogin">
            <label class="field">
              <span>用户名</span>
              <div class="input-shell">
                <span class="input-icon">♡</span>
                <input
                  v-model.trim="loginForm.username"
                  type="text"
                  autocomplete="username"
                  placeholder="请输入用户名"
                  @focus="hideCoverEyes"
                />
              </div>
            </label>

            <label class="field">
              <span>密码</span>
              <div class="input-shell">
                <span class="input-icon">✦</span>
                <input
                  v-model="loginForm.password"
                  type="password"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                  @focus="showEyesCover"
                  @blur="hideCoverEyes"
                />
              </div>
            </label>

            <div
              v-if="loginMessage.text"
              class="form-message"
              :class="{ error: loginMessage.type === 'error' }"
            >
              {{ loginMessage.text }}
            </div>

            <button class="cute-button primary-button" type="submit" :disabled="loading">
              <span class="button-deco">♡</span>
              <span>{{ loading ? '正在登录...' : '进入我的旅行世界' }}</span>
              <span class="button-arrow">➜</span>
            </button>
          </form>

          <p class="mobile-switch">
            还没有账号？
            <button type="button" @click="switchMode('register')">立即注册</button>
          </p>
        </div>
      </div>

      <!-- 注册 -->
      <div class="form-panel register-panel">

        <div class="boki-hanger">
          
          <div class="anya-effects" aria-hidden="true">
            <span class="spark spark-1">✦</span>
            <span class="spark spark-2">✧</span>
            <span class="heart heart-1">♥</span>
            <span class="heart heart-2">♡</span>
            <span class="spark spark-3">✦</span>
          </div>

          <img
            class="boki-image"
            :src="bokiNormalSrc"
            alt="角色装饰"
          />
        </div>
        
        <div class="form-content">
          <div class="brand">
            <span class="brand-badge">✿</span>
            <span>Travel Memory</span>
          </div>

          <p class="eyebrow">CREATE ACCOUNT</p>
          <h1>开始记录新的心动旅程</h1>

          <p class="form-description">
            创建账号后，就可以开始制作地图模式、故事模式和沉浸播放模式。
          </p>

          <form @submit.prevent="handleRegister">
            <label class="field">
              <span>用户名</span>
              <div class="input-shell">
                <span class="input-icon">♡</span>
                <input
                  v-model.trim="registerForm.username"
                  type="text"
                  autocomplete="username"
                  placeholder="设置登录用户名"
                  @focus="hideCoverEyes"
                />
              </div>
            </label>

            <label class="field">
              <span>昵称</span>
              <div class="input-shell">
                <span class="input-icon">✿</span>
                <input
                  v-model.trim="registerForm.nickname"
                  type="text"
                  placeholder="例如：杰哥"
                  @focus="hideCoverEyes"
                />
              </div>
            </label>

            <label class="field">
              <span>密码</span>
              <div class="input-shell">
                <span class="input-icon">✦</span>
                <input
                  v-model="registerForm.password"
                  type="password"
                  autocomplete="new-password"
                  placeholder="请设置密码"
                  @focus="showEyesCover"
                  @blur="hideCoverEyes"
                />
              </div>
            </label>

            <div
              v-if="registerMessage.text"
              class="form-message"
              :class="{ error: registerMessage.type === 'error' }"
            >
              {{ registerMessage.text }}
            </div>

            <button class="cute-button primary-button" type="submit" :disabled="loading">
              <span class="button-deco">✿</span>
              <span>{{ loading ? '正在注册...' : '创建我的旅行账号' }}</span>
              <span class="button-arrow">➜</span>
            </button>
          </form>

          <p class="mobile-switch">
            已经有账号？
            <button type="button" @click="switchMode('login')">返回登录</button>
          </p>
        </div>
      </div>

      <!-- 右侧滑动视觉区 -->
      <aside class="visual-panel">
        <div class="bubble bubble-1"></div>
        <div class="bubble bubble-2"></div>
        <div class="bubble bubble-3"></div>

        <div class="visual-content login-visual">
          <p class="visual-index">01 /浪漫与海</p>
          <h2>
            落日归山海<br />
            山海藏深意<br />
          
          </h2>
          <p>The setting sun returns to the mountains and seas, and the mountains and seas hide deep meaning. </p>

          <button class="cute-button ghost-button" type="button" @click="switchMode('register')">
            <span>♡</span>
            创建新账号
          </button>
        </div>

        <div class="visual-content register-visual">
          <p class="visual-index">02 / COME BACK</p>
          <h2>
            欢迎回来，<br />
            樱花与旅程都在等你。
          </h2>
          <p>登录后继续整理照片、路线和属于你的旅行故事。</p>

          <button class="cute-button ghost-button" type="button" @click="switchMode('login')">
            <span>✦</span>
            返回登录
          </button>
        </div>

        <div class="visual-decoration">
          <span class="deco-dot"></span>
          <span class="deco-line"></span>
          <span class="deco-dot active"></span>
          <span class="deco-line short"></span>
          <span class="deco-dot"></span>
        </div>
      </aside>
    </section>

    <p class="page-footer">
      TRAVEL MEMORY · sweet journey, soft stories, glowing memories.
    </p>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginApi, registerApi } from '@/api/auth'
import { loginDestination } from '@/router'

type AuthMode = 'login' | 'register'

const router = useRouter()
const route = useRoute()
const mode = ref<AuthMode>('login')
const loading = ref(false)
const showCoverEyes = ref(false)

/**
 * ★★★★★【阿尼亚 PNG 路径】★★★★★
 */
const anyaNormalSrc = '/images/anya-normal.png'
const anyaCoverEyesSrc = '/images/anya-cover-eyes.png'
/**
 * ★★★★★【boki PNG 路径】★★★★★
 */
const bokiNormalSrc = '/images/boki-normal.png'

const loginForm = reactive({
  username: '',
  password: ''
})

const registerForm = reactive({
  username: '',
  nickname: '',
  password: ''
})

const loginMessage = reactive({
  type: 'normal',
  text: ''
})

const registerMessage = reactive({
  type: 'normal',
  text: ''
})

/**
 * 固定配置樱花，避免 Math.random() 导致每次重绘都变化。
 */
const petals = [
  { id: 1, left: '6%', duration: '10s', delay: '0s', scale: '0.80' },
  { id: 2, left: '12%', duration: '13s', delay: '2s', scale: '1.10' },
  { id: 3, left: '19%', duration: '11s', delay: '4s', scale: '0.72' },
  { id: 4, left: '26%', duration: '14s', delay: '1s', scale: '1.20' },
  { id: 5, left: '34%', duration: '12s', delay: '5s', scale: '0.90' },
  { id: 6, left: '42%', duration: '15s', delay: '2.5s', scale: '0.76' },
  { id: 7, left: '50%', duration: '11.5s', delay: '6s', scale: '1.05' },
  { id: 8, left: '58%', duration: '13.5s', delay: '0.8s', scale: '0.82' },
  { id: 9, left: '65%', duration: '10.8s', delay: '3.3s', scale: '1.18' },
  { id: 10, left: '72%', duration: '14.5s', delay: '1.8s', scale: '0.74' },
  { id: 11, left: '79%', duration: '12.8s', delay: '5.4s', scale: '0.92' },
  { id: 12, left: '86%', duration: '11.8s', delay: '2.2s', scale: '1.12' },
  { id: 13, left: '92%', duration: '15.5s', delay: '4.2s', scale: '0.86' }
]

const switchMode = (target: AuthMode) => {
  mode.value = target
  loginMessage.text = ''
  registerMessage.text = ''
  hideCoverEyes()
}

const showEyesCover = () => {
  showCoverEyes.value = true
}

const hideCoverEyes = () => {
  showCoverEyes.value = false
}

const handleLogin = async () => {
  loginMessage.text = ''

  if (!loginForm.username || !loginForm.password) {
    loginMessage.type = 'error'
    loginMessage.text = '请输入用户名和密码'
    return
  }

  loading.value = true

  try {
    const result = await loginApi({
      username: loginForm.username,
      password: loginForm.password
    })

    if (result.code !== 200 || !result.data) {
      loginMessage.type = 'error'
      loginMessage.text = result.message || '登录失败'
      return
    }

    /**
     * ============================================================
     * JWT 登录状态
     * ============================================================
     *
     * 后端现在会返回：
     *
     * id
     * username
     * nickname
     * avatar
     * token
     *
     * token 单独保存，后续所有受保护 API 都会自动携带它。
     */
    const {
      token,
      ...userInfo
    } = result.data

    if (!token) {
      loginMessage.type = 'error'
      loginMessage.text = '登录失败：后端没有返回 JWT Token'
      return
    }

    localStorage.setItem(
      'travel_token',
      token
    )

    localStorage.setItem(
      'travel_user',
      JSON.stringify(userInfo)
    )

    loginMessage.type = 'normal'
    loginMessage.text = '登录成功，正在打开页面…'

    await router.replace(loginDestination(route.query.redirect))
  } catch (error) {
    console.error('登录请求失败：', error)
    loginMessage.type = 'error'
    loginMessage.text = error instanceof Error ? error.message : '暂时无法登录，请稍后重试'
  } finally {
    loading.value = false
    hideCoverEyes()
  }
}

const handleRegister = async () => {
  registerMessage.text = ''

  if (!registerForm.username || !registerForm.password) {
    registerMessage.type = 'error'
    registerMessage.text = '用户名和密码不能为空'
    return
  }

  loading.value = true

  try {
    const result = await registerApi({
      username: registerForm.username,
      password: registerForm.password,
      nickname: registerForm.nickname
    })

    if (result.code !== 200) {
      registerMessage.type = 'error'
      registerMessage.text = result.message || '注册失败'
      return
    }

    loginForm.username = registerForm.username
    loginForm.password = ''

    switchMode('login')

    loginMessage.type = 'normal'
    loginMessage.text = '注册成功，请使用刚创建的账号登录'
  } catch (error) {
    console.error('注册请求失败：', error)
    registerMessage.type = 'error'
    registerMessage.text = error instanceof Error ? error.message : '暂时无法注册，请稍后重试'
  } finally {
    loading.value = false
    hideCoverEyes()
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 34px;
  color: #7e4d67;
  background: #ffe8f0;
}

.page-bg {
  position: absolute;
  inset: 0;

  /*
   * ★★★★★【登录页背景图片】★★★★★
   * public/images/login-pink-bg.jpg
   *
   * 保留原图颜色，不再用高透明度粉色层把背景盖死。
   */
  background:
    url('/images/login-pink-bg.jpg')
    center / cover no-repeat;

  filter:
    saturate(1.05)
    brightness(0.96);
}

.page-overlay {
  position: absolute;
  inset: 0;

  /*
   * 只保留很轻的粉色氛围。
   */
  background:
    linear-gradient(
      135deg,
      rgba(255, 225, 238, 0.18),
      rgba(255, 189, 216, 0.10)
    ),
    radial-gradient(
      circle at 12% 18%,
      rgba(255, 255, 255, 0.22),
      transparent 24%
    );

  pointer-events: none;
}

.petal {
  --petal-scale: 1;
  position: absolute;
  top: -8%;
  width: 18px;
  height: 13px;
  opacity: .78;
  border-radius: 85% 0 85% 0;
  background: linear-gradient(135deg, #ffe0ec, #ffbdd5 66%, #f79abd);
  box-shadow: 0 3px 12px rgba(239, 132, 174, .18);
  animation: fallingPetal linear infinite;
}

@keyframes fallingPetal {
  0% {
    transform: translate3d(-10px, -10vh, 0) rotate(0deg) scale(var(--petal-scale));
    opacity: 0;
  }
  10% { opacity: .85; }
  50% {
    transform: translate3d(42px, 55vh, 0) rotate(210deg) scale(var(--petal-scale));
  }
  100% {
    transform: translate3d(95px, 115vh, 0) rotate(420deg) scale(var(--petal-scale));
    opacity: 0;
  }
}

.auth-shell {
  width: min(1120px, 92vw);
  min-height: 660px;
  position: relative;
  z-index: 3;
  overflow: visible;
  border: 1px solid rgba(255,255,255,.64);
  border-radius: 34px;
  background: rgba(255, 246, 250, .50);
  box-shadow:
    0 30px 90px rgba(225, 115, 164, .19),
    0 0 46px rgba(255, 177, 211, .30);
  backdrop-filter: blur(26px);
}

.shell-glow {
  position: absolute;
  inset: -2px;
  z-index: -1;
  border-radius: 36px;
  pointer-events: none;
  box-shadow:
    0 0 22px rgba(255, 160, 201, .42),
    0 0 48px rgba(255, 206, 225, .34),
    inset 0 0 28px rgba(255,255,255,.22);
  animation: shellPulse 3.4s ease-in-out infinite;
}

@keyframes shellPulse {
  0%, 100% {
    opacity: .62;
    filter: blur(0px);
  }
  50% {
    opacity: 1;
    filter: blur(1px);
  }
}

.anya-hanger {
  position: absolute;
  top: -295px;
  left: 118px;
  z-index: 10;
  width: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* animation: hangerFloat 3.8s ease-in-out infinite; */
}

.boki-hanger {
  position: absolute;
  top: 0px;
  left: 495px;
  z-index: 10;
  width: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* animation: hangerFloat 3.8s ease-in-out infinite; */
}

.hanger-string {
  width: 2px;
  height: 92px;
  background: linear-gradient(to bottom, rgba(255,255,255,.96), rgba(244, 148, 188, .58));
  box-shadow: 0 0 10px rgba(255,255,255,.45);
}

.anya-image {
  width: 218px;
  max-width: 100%;
  object-fit: contain;
  user-select: none;
  filter:
    drop-shadow(0 18px 26px rgba(217, 99, 151, .18))
    drop-shadow(0 0 12px rgba(255,255,255,.26));
}


.boki-image {
  width: 218px;
  max-width: 100%;
  object-fit: contain;
  user-select: none;

  /* 阴影 */
  filter:
    drop-shadow(0 18px 26px rgba(217, 99, 151, 0.18))
    drop-shadow(0 0 12px rgba(255, 255, 255, 0.26));

  /* ★★★★★ 人物底部渐隐过渡 ★★★★★ */
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 76%,
    rgba(0, 0, 0, 0.85) 84%,
    rgba(0, 0, 0, 0.4) 93%,
    transparent 100%
  );

  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 76%,
    rgba(0, 0, 0, 0.85) 84%,
    rgba(0, 0, 0, 0.4) 93%,
    transparent 100%
  );
}
.anya-effects {
  position: absolute;
  top: 78px;
  left: 0;
  width: 100%;
  height: 180px;
  pointer-events: none;
  
}

.anya-effects span {
  position: absolute;
  color: #ef8eb8;
  text-shadow: 0 0 10px rgba(255, 158, 197, .65);
}

.spark-1 {
  left: 9%;
  top: 20%;
  font-size: 23px;
  animation: twinkle 1.7s ease-in-out infinite;
}

.spark-2 {
  right: 8%;
  top: 13%;
  font-size: 19px;
  animation: twinkle 2.2s ease-in-out .45s infinite;
}

.spark-3 {
  right: 3%;
  bottom: 18%;
  font-size: 16px;
  animation: twinkle 1.9s ease-in-out .2s infinite;
}

.heart-1 {
  left: 2%;
  bottom: 22%;
  font-size: 18px;
  animation: heartFloat 2.5s ease-in-out infinite;
}

.heart-2 {
  right: 17%;
  bottom: 5%;
  font-size: 21px;
  color: #f5a0c2 !important;
  animation: heartFloat 2.9s ease-in-out .7s infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: .25; transform: scale(.72) rotate(-8deg); }
  50% { opacity: 1; transform: scale(1.25) rotate(9deg); }
}

@keyframes heartFloat {
  0%, 100% { opacity: .42; transform: translateY(6px) rotate(-8deg); }
  50% { opacity: 1; transform: translateY(-8px) rotate(8deg); }
}

@keyframes hangerFloat {
  0%, 100% { transform: translateY(0) rotate(-1.1deg); }
  50% { transform: translateY(6px) rotate(1.1deg); }
}

.form-panel {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  display: grid;
  place-items: center;
  transition:
    opacity .55s ease,
    transform .72s cubic-bezier(.22, 1, .36, 1);
}

.login-panel {
  /*
   * 阿尼亚现在就在 login-panel 里面。
   * login-panel 本身已经是 position:absolute，
   * 所以 anya-hanger 的 top / left 会以这里为基准。
   */
  left: 0;
  z-index: 6;
  overflow: visible;
  opacity: 1;
  transform: translateX(0);
}

.register-panel {
  left: 50%;
  opacity: 0;
  transform: translateX(20%);
  pointer-events: none;
}

.auth-shell.register-mode .login-panel {
  opacity: 0;
  transform: translateX(-20%);
  pointer-events: none;
}

.auth-shell.register-mode .register-panel {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.form-content {
  width: min(380px, calc(100% - 64px));
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 42px;
  color: #7b4563;
  font-weight: 800;
}

.brand-badge {
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #d86f9e;
  border: 1px solid rgba(218, 105, 155, .24);
  background: rgba(255,255,255,.62);
  box-shadow: 0 7px 18px rgba(225, 128, 168, .14);
}

.eyebrow,
.visual-index {
  margin: 0 0 9px;
  color: rgba(200, 91, 140, .72);
  font-size: 11px;
  letter-spacing: .18em;
}

h1 {
  margin: 0;
  color: #794660;
  font-size: clamp(31px, 3vw, 43px);
  line-height: 1.14;
}

.form-description {
  margin: 14px 0 31px;
  color: rgba(126, 75, 99, .72);
  line-height: 1.8;
  font-size: 14px;
}

.field {
  display: block;
  margin-bottom: 17px;
}

.field > span {
  display: block;
  margin-bottom: 8px;
  color: rgba(121, 68, 93, .82);
  font-size: 13px;
}

.input-shell {
  position: relative;
}

.input-icon {
  position: absolute;
  z-index: 2;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #da7aa5;
  font-size: 15px;
  pointer-events: none;
}

.field input {
  width: 100%;
  height: 52px;
  border: 1px solid rgba(239, 168, 198, .64);
  border-radius: 17px;
  outline: none;
  padding: 0 18px 0 44px;
  color: #764159;
  background: rgba(255,255,255,.78);
  box-shadow: inset 0 2px 9px rgba(215, 125, 163, .05);
  transition: .25s ease;
}

.field input::placeholder {
  color: rgba(157, 103, 128, .5);
}

.field input:focus {
  border-color: #f08bb7;
  background: rgba(255,255,255,.94);
  box-shadow:
    0 0 0 4px rgba(244, 145, 187, .13),
    0 8px 22px rgba(236, 138, 179, .10);
}

.form-message {
  min-height: 21px;
  margin: 0 0 11px;
  color: #be5d89;
  font-size: 13px;
}

.form-message.error {
  color: #d75d74;
}

.cute-button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.primary-button {
  width: 100%;
  height: 55px;
  margin-top: 5px;
  padding: 0 17px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  border-radius: 17px;
  color: #773c5b;
  font-weight: 800;
  background:
    linear-gradient(135deg, #ffc9de 0%, #ffdbe9 48%, #fff0bd 100%);
  box-shadow:
    0 14px 32px rgba(228, 125, 169, .21),
    inset 0 1px 0 rgba(255,255,255,.72);
  transition: .25s ease;
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-3px) scale(1.01);
  box-shadow:
    0 19px 40px rgba(228, 125, 169, .27),
    0 0 24px rgba(255, 183, 214, .29);
}

.primary-button:active:not(:disabled) {
  transform: translateY(-1px) scale(.99);
}

.primary-button:disabled {
  cursor: wait;
  opacity: .66;
}

.button-deco {
  color: #d95f94;
  font-size: 18px;
}

.button-arrow {
  font-size: 18px;
}

.visual-panel {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 50%;
  width: 50%;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid rgba(255,255,255,.42);
  border-radius: 0 34px 34px 0;
  background:
    linear-gradient(145deg, rgba(255, 198, 223, .60), rgba(255, 237, 245, .34)),
    radial-gradient(circle at 76% 18%, rgba(255,255,255,.58), transparent 34%);
  transition: transform .82s cubic-bezier(.22, 1, .36, 1);
}

.auth-shell.register-mode .visual-panel {
  transform: translateX(-100%);
  border-radius: 34px 0 0 34px;
  border-left: 0;
  border-right: 1px solid rgba(255,255,255,.42);
}

.bubble {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  background: rgba(255,255,255,.18);
  border: 1px solid rgba(255,255,255,.32);
  box-shadow: inset 0 0 18px rgba(255,255,255,.18);
  animation: bubbleFloat 7s ease-in-out infinite alternate;
}

.bubble-1 { width: 115px; height: 115px; top: 7%; right: 8%; }
.bubble-2 { width: 54px; height: 54px; bottom: 14%; right: 17%; animation-delay: -2s; }
.bubble-3 { width: 78px; height: 78px; top: 23%; left: 12%; animation-delay: -4s; }

@keyframes bubbleFloat {
  from { transform: translateY(-6px) translateX(0); }
  to { transform: translateY(15px) translateX(12px); }
}

.visual-content {
  position: absolute;
  z-index: 2;
  inset: 0;
  padding: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: opacity .36s ease, transform .55s ease;
}

.visual-content h2 {
  margin: 0;
  max-width: 450px;
  color: #7c4d66;
  font-size: clamp(36px, 4vw, 58px);
  line-height: 1.10;
  letter-spacing: -.04em;
}

.visual-content > p:not(.visual-index) {
  max-width: 360px;
  margin: 22px 0 30px;
  color: rgba(126, 77, 101, .73);
  line-height: 1.8;
}

.login-visual {
  /*
   * 登录状态下，这一层可以接收点击。
   */
  pointer-events: auto;
}

.register-visual {
  opacity: 0;
  transform: translateX(40px);

  /*
   * 关键修复：
   * 以前这一层虽然 opacity:0，
   * 但仍然盖在“创建新账号”按钮上方接收点击。
   */
  pointer-events: none;
}

.auth-shell.register-mode .login-visual {
  opacity: 0;
  transform: translateX(-40px);
  pointer-events: none;
}

.auth-shell.register-mode .register-visual {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.ghost-button {
  align-self: flex-start;
  padding: 12px 18px;
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid rgba(213, 111, 155, .26);
  border-radius: 999px;
  color: #824968;
  background: rgba(255,255,255,.44);
  box-shadow: 0 9px 24px rgba(222, 125, 168, .11);
  transition: .25s ease;
}

.ghost-button:hover {
  transform: translateY(-3px);
  background: rgba(255,255,255,.62);
  box-shadow: 0 13px 30px rgba(222, 125, 168, .16);
}

.visual-decoration {
  position: absolute;
  pointer-events: none;
  left: 58px;
  bottom: 55px;
  display: flex;
  align-items: center;
}

.deco-dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  border: 2px solid rgba(196, 105, 145, .52);
}

.deco-dot.active {
  background: #ee91b9;
  border-color: #ee91b9;
  box-shadow: 0 0 22px rgba(238, 145, 185, .64);
}

.deco-line {
  width: 74px;
  height: 1px;
  background: rgba(194, 111, 149, .35);
}

.deco-line.short {
  width: 38px;
}

.mobile-switch {
  display: none;
  margin-top: 23px;
  color: rgba(124, 77, 99, .68);
  font-size: 13px;
}

.mobile-switch button {
  border: 0;
  padding: 0;
  color: #d16595;
  cursor: pointer;
  background: none;
}

.page-footer {
  position: absolute;
  z-index: 2;
  bottom: 18px;
  margin: 0;
  color: rgba(145, 92, 118, .43);
  font-size: 10px;
  letter-spacing: .16em;
}

@media (max-width: 1000px) {
  .auth-page {
    padding: 18px;
  }

  .auth-shell {
    width: min(520px, 96vw);
    min-height: 690px;
  }


  .form-panel {
    width: 100%;
    left: 0;
  }

  .register-panel {
    left: 0;
    transform: translateX(16%);
  }

  .auth-shell.register-mode .register-panel {
    transform: translateX(0);
  }

  .visual-panel {
    display: none;
  }

  .mobile-switch {
    display: block;
  }

  .form-content {
    width: min(400px, calc(100% - 42px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .petal,
  .anya-hanger,
  .anya-effects span,
  .bubble,
  .shell-glow {
    animation: none;
  }

  .form-panel,
  .visual-panel {
    transition-duration: .01ms;
  }
}
</style>
