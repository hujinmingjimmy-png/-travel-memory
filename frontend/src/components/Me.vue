<template>
  <main class="me-page" :style="{ '--tm-overlay-alpha': String(appearance.overlayPercent / 100) }">
    <div class="tm-street-backdrop" aria-hidden="true"></div>
    <div class="page-overlay" aria-hidden="true"></div>

    <aside class="sidebar glass">
      <div class="profile">
        <ProfileAvatarSettings
          :user-id="Number(user.id || 0)"
          :name="displayName"
          :avatar="user.avatar || null"
        />

        <div>
          <p>PERSONAL ARCHIVE</p>
          <h2>{{ displayName }}</h2>
          <span>@{{ user.username || 'traveler' }}</span>
        </div>
      </div>

      <nav aria-label="个人档案导航">
        <button
          :class="{ active: activeSection === 'overview' }"
          @click="scrollTo('overview')"
        >
          <span>✦</span>
          概览
        </button>

        <button
          :class="{ active: activeSection === 'journeys' }"
          @click="scrollTo('journeys')"
        >
          <span>♡</span>
          我的旅程
        </button>

        <!-- TRAVEL_SOCIAL_V12: independent social hub -->
        <button type="button" :class="{active:activeSection==='friends'}" @click="openSocial('friends')"><span>♡</span> 我的好友</button>
        <button type="button" :class="{active:activeSection==='messages'}" @click="openSocial('messages')"><span>✉</span> 消息中心 <SocialNavBadge /></button>



      </nav>

      <div class="sidebar-bottom">
        <div class="soft-note">
          <span>♡</span>
          <p>
            把每一次出发，<br />
            留成可以再次打开的记忆。
          </p>
        </div>

        <button
          class="logout"
          @click="logout"
        >
          ↩ 退出登录
        </button>
      </div>
    </aside>

    <section class="content">
      <!-- TRAVEL_SOCIAL_V121: social functions stay inside the personal page -->
      <SocialHub v-if="activeSection==='friends'||activeSection==='messages'" :embedded="true" :initial-tab="socialTab" @travels-changed="loadMyTravels" />
      <template v-else>
      <header class="topbar">
        <div>
          <p class="eyebrow">
            03 / THE PERSONAL ARCHIVE
          </p>

          <h1>{{ displayName }}的旅行档案</h1>
        </div>

        <div class="topbar-actions"><button type="button" class="soft-button" @click="appearanceOpen=!appearanceOpen" :aria-expanded="appearanceOpen">⚙ 外观设置</button>
        <button
          class="pink-button"
          @click="openCreateModal"
        >
          <span>✿</span>
          创建旅行
          <span>＋</span>
        </button></div>
      </header>
      <section v-if="appearanceOpen" class="appearance-panel glass" aria-label="外观设置">
        <div class="appearance-title"><strong>外观设置</strong><button type="button" class="soft-button" @click="appearanceOpen=false">关闭</button></div>
        <label>背景粉色滤镜强度 <b>{{ appearance.overlayPercent }}%</b>
          <input type="range" min="0" max="80" step="1" v-model.number="appearance.overlayPercent" @input="scheduleAppearanceSave" @change="saveAppearanceNow" />
        </label>
        <div class="appearance-controls"><button class="soft-button" type="button" @click="appearance.overlayPercent=15;scheduleAppearanceSave()">恢复默认滤镜 15%</button><span v-if="appearanceMessage" role="status">{{appearanceMessage}}</span></div>
        <div class="appearance-title"><strong>概览卡面背景</strong><span>默认：油画。也可以选择自己的照片。</span></div>
        <input ref="overviewImageInput" hidden type="file" accept="image/jpeg,image/png" @change="onOverviewImageChange" />
        <div class="appearance-controls"><button type="button" class="soft-button" :disabled="appearanceBusy" @click="overviewImageInput?.click()">{{appearance.hasOverviewImage?'更换背景图片':'选择背景图片'}}</button><button type="button" class="soft-button" :disabled="appearanceBusy || !appearance.hasOverviewImage" @click="clearOverviewImage">移除 / 恢复默认背景</button></div>
        <template v-if="appearance.hasOverviewImage">
          <label>图片水平焦点 <b>{{appearance.positionX}}%</b><input type="range" min="0" max="100" v-model.number="appearance.positionX" @input="scheduleAppearanceSave" @change="saveAppearanceNow" /></label>
          <label>图片垂直焦点 <b>{{appearance.positionY}}%</b><input type="range" min="0" max="100" v-model.number="appearance.positionY" @input="scheduleAppearanceSave" @change="saveAppearanceNow" /></label>
        </template>
        <p class="appearance-help">背景图片仅供你的账号使用。文字与按钮不会被写入图片。{{appearanceError}}</p>
      </section>

      <!-- ========================= 概览 ========================= -->
      <section
        id="overview"
        class="hero section-anchor"
      >
        <div class="overview-art" aria-hidden="true" :style="overviewImageUrl ? {
          backgroundImage: `url(${JSON.stringify(overviewImageUrl)}), var(--tm-overview-art)`,
          backgroundPosition: `${appearance.positionX}% ${appearance.positionY}%, 64% center`
        } : {}"></div>
        <div class="hero-copy">
          <span class="tm-kicker">
            Volume 01 / A World of Memories
          </span>

          <h2>
            把旅行，
            <span>做成一段可以播放的粉色回忆。</span>
          </h2>

          <p>
            收藏沿途照片与故事，重温每一次出发。
            开启共创后，还可以邀请同行者一起补全回忆。
          </p>

          <div class="hero-buttons">
            <button
              class="tm-action light"
              @click="openCreateModal"
            >
              开始创作 ↗
            </button>

            <button
              class="tm-action outline"
              @click="scrollTo('journeys')"
            >
              查看我的旅程
            </button>
          </div>
        </div>
        <span v-if="!overviewImageUrl" class="overview-credit tm-kicker">油画 / 默认封面</span>
      </section>

      <!-- 数据 -->
      <div class="stats">
        <article class="stat glass">
          <span>♡</span>
          <strong>{{ myTravels.length }}</strong>
          <p>我的旅程（含共创）</p>
        </article>

        <article class="stat glass">
          <span>✿</span>
          <strong>{{ publishedCount }}</strong>
          <p>已发布旅程</p>
        </article>

        <article class="stat glass">
          <span>◎</span>
          <strong>{{ publicCount }}</strong>
          <p>公开旅程</p>
        </article>
      </div>



    <!-- ========================= 我的旅行 ========================= -->
      <section
        id="journeys"
        class="journey-section section-anchor"
      >
        <div class="section-heading">
          <div>
            <p class="tm-kicker">Collection Index / {{ myTravels.length }} 段旅程</p>
            <h2>我的旅程</h2>
          </div>

          <button
            class="text-button"
            @click="loadMyTravels"
          >
            ↻ 刷新
          </button>
        </div>

        <div
          v-if="loadingTravels"
          class="empty glass"
        >
          正在读取你的旅行...
        </div>

        <div
          v-else-if="myTravels.length === 0"
          class="empty glass"
        >
          <span>♡</span>
          <h3>还没有旅行</h3>
          <p>
            从一次出发、一张照片或一处足迹开始。
          </p>

          <button
            class="pink-button"
            @click="openCreateModal"
          >
            ＋ 创建第一段旅行
          </button>
        </div>

        <div
          v-else
          class="journey-grid"
        >
          <article
            v-for="(travel, index) in myTravels"
            :key="travel.id"
            class="journey-card glass"
            tabindex="0" role="link" :aria-label="`打开旅行：${travel.title}`"
            @keydown.enter.self.prevent="openTravel(travel)" @keydown.space.self.prevent="openTravel(travel)"
            @click="openTravel(travel)"
          >
            <div class="cover">
              <JourneyCover
                :travel-id="travel.id"
                :direct-url="travel.coverUrl"
                :background-url="travel.backgroundUrl"
                :lookup-theme="travel.myRole === 'OWNER' || (travel.visibility === 'PUBLIC' && travel.isPublished === 1)"
                :album-fallback="travel.myRole === 'OWNER' || (travel.visibility === 'PUBLIC' && travel.isPublished === 1)"
                :revision="collectionRevision"
              />
              <div class="cover-mask"></div>
              <JourneyMemberStack :members="travel.members || []" />

              <div class="cover-top">
                <span
                  class="status"
                  :class="{
                    published: travel.isPublished === 1
                  }"
                >
                  {{
                    travel.isPublished === 1
                      ? '已发布'
                      : '草稿'
                  }}
                </span>

                <span class="visibility">
                  {{
                    travel.visibility === 'PUBLIC'
                      ? '公开'
                      : '私密'
                  }}
                </span>
              </div>
            </div>
            <div class="card-body">
              <p class="date">
                <span class="volume-number">№ {{ String(index + 1).padStart(2, '0') }}</span>
                {{ dateRange(travel) }}
              </p>

              <h3 class="city-title"><span>{{ travel.title }}</span></h3>

              <p class="subtitle">
                {{
                  travel.subtitle
                  || travel.description
                  || '还没有写旅行简介'
                }}
              </p>

              <div class="card-actions">
                <button
                  class="open-button"
                  @click.stop="openTravel(travel)"
                >
                  打开旅程 ↗
                </button>

                <button v-if="travel.myRole === 'OWNER' && travel.collabEnabled" type="button" class="collab-invite-button" @click.stop="openInvite(travel)">邀请同行</button>

                <button
                  v-if="travel.myRole === 'OWNER' && travel.isPublished !== 1"
                  class="publish-button"
                  @click.stop="publish(travel)"
                >
                  发布
                </button>


              </div>
            </div>
          </article>

          <button
            type="button"
            class="new-card glass"
            @click="openCreateModal"
          >
            <span>＋</span>
            <strong>创建新旅行</strong>
            <small>记录下一次出发</small>
          </button>
        </div>
      </section>

      <!-- ========================= 三大模式 ========================= -->

      </template>
    </section>

    <CollabInviteDialog v-if="inviteTravel" :travel="inviteTravel" @close="inviteTravel = null" @changed="onCollabChanged" />

    <!-- ========================= 创建旅行弹窗 ========================= -->
    <transition name="modal">
      <div
        v-if="showCreateModal"
        class="modal-mask"
        @click.self="closeCreateModal"
      >
        <section class="create-modal" role="dialog" aria-modal="true" aria-label="创建旅行" @keydown.esc.stop.prevent="closeCreateModal">
          <div class="modal-heading">
            <div>
              <p class="eyebrow">
                CREATE JOURNEY
              </p>

              <h2>创建一段新的旅行</h2>
            </div>

            <button
              class="close-button"
              @click="closeCreateModal"
            >
              ×
            </button>
          </div>

          <form
            class="create-form"
            @submit.prevent="submitCreate"
          >
            <label class="full">
              <span>
                旅行标题 <b>*</b>
              </span>

              <input
                v-model.trim="createForm.title"
                maxlength="100"
                ref="createTitleInput"
                placeholder="例如：云南 · 一路向西"
              />
            </label>

            <label class="full">
              <span>副标题</span>

              <input
                v-model.trim="createForm.subtitle"
                placeholder="例如：从昆明到丽江，把风吹过的地方都留下。"
              />
            </label>

            <label>
              <span>开始日期</span>

              <input
                v-model="createForm.startDate"
                type="date"
              />
            </label>

            <label>
              <span>结束日期</span>

              <input
                v-model="createForm.endDate"
                type="date"
              />
            </label>

            <label class="full">
              <span>旅行简介</span>

              <textarea
                v-model.trim="createForm.description"
                rows="4"
                placeholder="写一点关于这次旅行的故事..."
              ></textarea>
            </label>

            <label class="full">
              <span>封面图片地址（可选）</span>

              <input
                v-model.trim="createForm.coverUrl"
                placeholder="/images/my-trip.jpg"
              />
            </label>

            <label class="full">
              <span>谁可以看到？</span>

              <div class="visibility-options">
                <button
                  type="button"
                  :class="{
                    active: createForm.visibility === 'PRIVATE'
                  }"
                  @click="createForm.visibility = 'PRIVATE'"
                >
                  <strong>♡ 私密</strong>
                  <small>
                    只有自己可以查看
                  </small>
                </button>

                <button
                  type="button"
                  :class="{
                    active: createForm.visibility === 'PUBLIC'
                  }"
                  @click="createForm.visibility = 'PUBLIC'"
                >
                  <strong>✦ 公开</strong>
                  <small>
                    发布后可在发现页浏览
                  </small>
                </button>
              </div>
            </label>

            <p
              v-if="createMessage"
              class="form-message"
            >
              {{ createMessage }}
            </p>

            <div class="modal-actions full">
              <button
                type="button"
                class="soft-button"
                @click="closeCreateModal"
              >
                取消
              </button>

              <button
                type="submit"
                class="pink-button"
                :disabled="creating"
              >
                {{
                  creating
                    ? '正在创建...'
                    : '✿ 创建旅行'
                }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </transition>

    <transition name="toast">
      <div
        v-if="toast"
        class="toast"
      >
        ✿ {{ toast }}
      </div>
    </transition>
  </main>
</template>

<script setup lang="ts">
import SocialNavBadge from '@/components/SocialNavBadge.vue'
import SocialHub from '@/components/SocialHub.vue'
import JourneyMemberStack from '@/components/JourneyMemberStack.vue'
import JourneyCover from '@/components/JourneyCover.vue'
import CollabInviteDialog from '@/components/CollabInviteDialog.vue'
import { getCollabMyTravelsApi, type CollabTravelCard } from '@/api/collab'
import ProfileAvatarSettings from '@/components/ProfileAvatarSettings.vue'
import { getAppearance,updateAppearance,uploadOverviewImage,removeOverviewImage,getOverviewBlobUrl,type Appearance } from '@/api/appearance'

import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  reactive,
  watch,
  ref
} from 'vue'

import {
  useRoute,
  useRouter
} from 'vue-router'

import {
  createTravelApi,
  getMyTravelsApi,
  publishTravelApi,
  type TravelProject
} from '@/api/travel'

interface StoredUser {
  id?: number
  username?: string
  nickname?: string | null
  avatar?: string | null
}

const route = useRoute()
const router = useRouter()

const user = ref<StoredUser>({})

try {
  const raw =
    localStorage.getItem(
      'travel_user'
    )

  if (raw) {
    user.value = JSON.parse(raw)
  }
} catch (error) {
  console.error(
    '读取用户信息失败：',
    error
  )
}

const appearance = reactive<Appearance>({overlayPercent:15,positionX:50,positionY:50,hasOverviewImage:false})
const appearanceOpen=ref(false),appearanceBusy=ref(false),appearanceMessage=ref(''),appearanceError=ref('')
const overviewImageUrl=ref(''),overviewImageInput=ref<HTMLInputElement|null>(null)
let appearanceTimer:number|undefined,appearanceGeneration=0,overviewGeneration=0
let disposed = false
function clearOverviewBlob(){if(overviewImageUrl.value)URL.revokeObjectURL(overviewImageUrl.value);overviewImageUrl.value=''}
async function refreshOverviewBlob(){
  const generation = ++overviewGeneration
  clearOverviewBlob()
  if(!appearance.hasOverviewImage)return
  try{
    const url = await getOverviewBlobUrl()
    if (disposed || generation !== overviewGeneration) URL.revokeObjectURL(url)
    else overviewImageUrl.value = url
  }
  catch{if (!disposed && generation === overviewGeneration) appearanceError.value='图片暂时无法加载，请稍后重试。'}
}
async function loadAppearance(){
  const generation=++appearanceGeneration
  try{
    const r=await getAppearance()
    if(generation!==appearanceGeneration)return
    if(r.code!==200)throw new Error(r.message)
    Object.assign(appearance,r.data)
    appearanceError.value=''
    await refreshOverviewBlob()
  }catch{appearanceError.value='外观设置暂时无法读取，当前使用默认显示。'}
}
function scheduleAppearanceSave(){
  appearanceMessage.value='待保存…'
  if(appearanceTimer)clearTimeout(appearanceTimer)
  appearanceTimer=window.setTimeout(()=>{void saveAppearanceNow()},350)
}
async function saveAppearanceNow(){
  if(appearanceTimer){clearTimeout(appearanceTimer);appearanceTimer=undefined}
  const expected={overlayPercent:appearance.overlayPercent,positionX:appearance.positionX,positionY:appearance.positionY}
  try{
    const r=await updateAppearance(expected)
    if(r.code!==200)throw new Error(r.message)
    appearanceMessage.value='已保存'
    appearanceError.value=''
  }catch(e){appearanceMessage.value='保存失败';appearanceError.value=e instanceof Error?e.message:'请检查网络并重试'}
}
async function onOverviewImageChange(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value=''
  if(!file||appearanceBusy.value)return
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>8*1024*1024){appearanceError.value='请选择 8MB 以内的 JPG 或 PNG 图片';return}
  appearanceBusy.value=true;appearanceError.value=''
  try{
    const r=await uploadOverviewImage(file);if(r.code!==200)throw new Error(r.message)
    appearance.hasOverviewImage=r.data.hasOverviewImage
    await refreshOverviewBlob()
    appearanceMessage.value='图片已保存'
  }catch(e){appearanceError.value=e instanceof Error?e.message:'背景图片上传失败'}
  finally{appearanceBusy.value=false}
}
async function clearOverviewImage(){
  if(appearanceBusy.value)return
  appearanceBusy.value=true
  try{
    const r=await removeOverviewImage();if(r.code!==200)throw new Error(r.message)
    appearance.hasOverviewImage=false;overviewGeneration++;clearOverviewBlob();appearanceMessage.value='已恢复默认背景'
  }catch(e){appearanceError.value=e instanceof Error?e.message:'移除失败'}
  finally{appearanceBusy.value=false}
}
const displayName =
  computed(() => {
    return (
      user.value.nickname
      || user.value.username
      || '旅行者'
    )
  })

const activeSection = computed(() => {const s=route.query.section;return ['overview','journeys','friends','messages'].includes(String(s))?String(s):'overview'})
const socialTab = computed<'friends'|'messages'>(()=>activeSection.value==='messages'?'messages':'friends')
const openSocial = (next: 'friends'|'messages') => {
  void router.push({path:'/me',query:{section:next}})
  window.scrollTo({ top:0,behavior:'auto' })
}

const myTravels =
  ref<CollabTravelCard[]>([])
const collectionRevision = ref(0)
// TRAVEL_SOCIAL_V12: never hide owned journeys when optional collaboration data fails.
const getSafeCollabMyTravelsApi = async () => {
  try {const result=await getCollabMyTravelsApi();if(result.code===200)return result}catch{}
  const fallback=await getMyTravelsApi()
  return {...fallback,data:(fallback.data||[]).map(item=>({
    ...item,myRole:'OWNER' as const,members:[],memberCount:1,collabEnabled:false
  }))}
}


const inviteTravel = ref<CollabTravelCard | null>(null)
const openInvite = (travel: CollabTravelCard) => { inviteTravel.value = travel }
const onCollabChanged = async () => {
  const id = inviteTravel.value?.id
  await loadMyTravels()
  inviteTravel.value = myTravels.value.find(t => t.id === id) || null
}

const loadingTravels =
  ref(false)

const showCreateModal =
  ref(false)

const creating =
  ref(false)

const createMessage =
  ref('')

const toast =
  ref('')

let toastTimer:
  number | undefined

const createForm =
  reactive({
    title: '',
    subtitle: '',
    description: '',
    coverUrl: '',
    startDate: '',
    endDate: '',
    visibility: 'PRIVATE' as 'PRIVATE' | 'PUBLIC'
  })

const publishedCount =
  computed(() => {
    return myTravels.value.filter(
      item => item.isPublished === 1
    ).length
  })

const publicCount =
  computed(() => {
    return myTravels.value.filter(
      item => item.visibility === 'PUBLIC'
    ).length
  })

const showToast = (
  message: string
) => {
  toast.value = message

  if (toastTimer) {
    window.clearTimeout(
      toastTimer
    )
  }

  toastTimer =
    window.setTimeout(() => {
      toast.value = ''
    }, 2300)
}

const loadMyTravels =
  async () => {

    loadingTravels.value = true

    try {
      const result =
        await getSafeCollabMyTravelsApi()

      if (result.code !== 200) {
        showToast(
          result.message
          || '读取旅行失败'
        )
        return
      }

      myTravels.value =
        result.data || []
      collectionRevision.value++

    } catch (error) {
      console.error(
        '读取旅行失败：',
        error
      )

      showToast(
        '无法读取旅行，请确认后端已启动'
      )

    } finally {
      loadingTravels.value = false
    }
  }

const resetCreateForm = () => {
  createForm.title = ''
  createForm.subtitle = ''
  createForm.description = ''
  createForm.coverUrl = ''
  createForm.startDate = ''
  createForm.endDate = ''
  createForm.visibility = 'PRIVATE'
  createMessage.value = ''
}

const createTitleInput = ref<HTMLInputElement | null>(null)
let createTrigger: HTMLElement | null = null
const openCreateModal = () => {
  createTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  resetCreateForm()
  showCreateModal.value = true
  void nextTick(() => createTitleInput.value?.focus())
}

const closeCreateModal = () => {
  if (creating.value) {
    return
  }

  showCreateModal.value = false
  if (createTrigger?.isConnected) createTrigger.focus()
  if(route.query.create){const query={...route.query};delete query.create;void router.replace({path:'/me',query})}
}

const submitCreate =
  async () => {
    if (creating.value) return

    createMessage.value = ''

    if (!createForm.title) {
      createMessage.value =
        '请先填写旅行标题'
      return
    }

    if (
      createForm.startDate
      && createForm.endDate
      && createForm.endDate
      < createForm.startDate
    ) {
      createMessage.value =
        '结束日期不能早于开始日期'
      return
    }

    creating.value = true

    try {
      const result =
        await createTravelApi({
          title: createForm.title,
          subtitle:
            createForm.subtitle
            || undefined,
          description:
            createForm.description
            || undefined,
          coverUrl:
            createForm.coverUrl
            || undefined,
          startDate:
            createForm.startDate
            || undefined,
          endDate:
            createForm.endDate
            || undefined,
          visibility:
            createForm.visibility
        })

      if (result.code !== 200) {
        createMessage.value =
          result.message
          || '创建旅行失败'
        return
      }

      showCreateModal.value = false
      if (result.data) {
        await router.replace({ name: 'JourneyDetail', params: { id: result.data } })
        return
      }
      await loadMyTravels()
      showToast('旅行已创建')

    } catch (error) {
      console.error(
        '创建旅行失败：',
        error
      )

      createMessage.value =
        error instanceof Error ? error.message : '暂时无法创建旅行，请稍后重试'

    } finally {
      creating.value = false
    }
  }

const publish =
  async (
    travel: CollabTravelCard
  ) => {

    if (
      travel.isPublished === 1
    ) {
      return
    }

    try {
      const result =
        await publishTravelApi(
          travel.id
        )

      if (result.code !== 200) {
        showToast(
          result.message
          || '发布失败'
        )
        return
      }

      await loadMyTravels()

      if (
        travel.visibility === 'PUBLIC'
      ) {
        showToast(
          '发布成功，这段旅行可以在发现页浏览'
        )
      } else {
        showToast(
          '发布成功，仍只有授权用户可以查看'
        )
      }

    } catch (error) {
      console.error(
        '发布旅行失败：',
        error
      )

      showToast(
        '发布失败，请确认后端已启动'
      )
    }
  }

const openTravel =
  async (travel: CollabTravelCard) => {
    await router.push(travel.myRole === 'OWNER' ? `/journey/${travel.id}` : `/collab/journey/${travel.id}`)
  }

const scrollTo = async (
  id: string
) => {
  await router.push({path:'/me',query:{section:id}})

  void nextTick(() => document.getElementById(id)?.scrollIntoView({
    behavior:'auto',block:'start'
  }))
}

const dateRange = (
  travel: TravelProject
) => {
  if (
    travel.startDate
    && travel.endDate
  ) {
    return (
      `${travel.startDate}`
      + ` → ${travel.endDate}`
    )
  }

  if (travel.startDate) {
    return travel.startDate
  }

  return '日期待补充'
}

const logout =
  async () => {
    localStorage.removeItem(
      'travel_user'
    )

    localStorage.removeItem(
      'travel_token'
    )

    await router.replace(
      '/login'
    )
  }

watch(()=>route.query.create,value=>{if(value==='1')openCreateModal()})

onMounted(async () => {
  void loadAppearance()
  await loadMyTravels()
  if(activeSection.value === 'journeys')await nextTick(()=>document.getElementById('journeys')?.scrollIntoView({block:'start'}))

  /**
   * 首页“创建旅行”按钮可以跳到：
   *
   * /me?create=1
   *
   * 自动打开创建弹窗。
   */
  if (
    route.query.create === '1'
  ) {
    openCreateModal()
  }
})
onBeforeUnmount(()=>{disposed=true;appearanceGeneration++;overviewGeneration++;if(appearanceTimer)clearTimeout(appearanceTimer);clearOverviewBlob()})
</script>

<style scoped>
.me-page {
  min-height: 100vh;
  position: relative;
  display: grid;
  grid-template-columns: 264px 1fr;
  gap: 22px;
  padding: 22px;
  overflow-x: hidden;
  color: #75435d;
  background: #ffeaf2;
}

.page-overlay {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(
      circle at 12% 12%,
      rgba(255,255,255,.70),
      transparent 22%
    ),
    radial-gradient(
      circle at 82% 20%,
      rgba(255,255,255,.36),
      transparent 20%
    );
  pointer-events: none;
}

.glass {
  border:
    1px solid
    rgba(255,255,255,.68);
  background:
    rgba(255, 249, 252, .54);
  box-shadow:
    0 20px 52px
    rgba(216, 110, 155, .12),
    inset 0 1px 0
    rgba(255,255,255,.48);
  backdrop-filter: blur(23px);
}

.sidebar {
  position: sticky;
  z-index: 4;
  top: 22px;
  height: calc(100vh - 44px);
  box-sizing: border-box;
  padding: 22px 17px;
  display: flex;
  flex-direction: column;
  border-radius: 28px;
}

.profile {
  padding: 7px;
  display: flex;
  align-items: center;
  gap: 13px;
}

.avatar {
  width: 55px;
  height: 55px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #864765;
  font-size: 20px;
  font-weight: 900;
  background:
    linear-gradient(
      135deg,
      #ffd0e1,
      #fff0bb
    );
  box-shadow:
    0 10px 24px
    rgba(218, 112, 157, .18);
}

.profile p {
  margin: 0;
  color:
    rgba(155, 84, 118, .48);
  font-size: 9px;
  letter-spacing: .12em;
}

.profile h2 {
  margin: 2px 0;
  font-size: 16px;
}

.profile span {
  color:
    rgba(133, 76, 102, .43);
  font-size: 10px;
}

.sidebar nav {
  margin-top: 38px;
  display: grid;
  gap: 8px;
}

.sidebar nav button {
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 15px;
  color:
    rgba(127, 71, 97, .57);
  cursor: pointer;
  text-align: left;
  background: transparent;
  transition: .23s ease;
}

.sidebar nav button:hover,
.sidebar nav button.active {
  color: #7c4260;
  transform: translateX(4px);
  background:
    rgba(255,255,255,.51);
}

.sidebar nav span {
  color: #da75a0;
}

.sidebar-bottom {
  margin-top: auto;
}

.soft-note {
  padding: 14px;
  display: flex;
  gap: 10px;
  border-radius: 17px;
  background:
    rgba(255,255,255,.31);
}

.soft-note span {
  color: #dc75a0;
}

.soft-note p {
  margin: 0;
  color:
    rgba(126, 72, 97, .52);
  font-size: 10px;
  line-height: 1.7;
}

.logout {
  width: 100%;
  height: 44px;
  margin-top: 14px;
  border:
    1px solid
    rgba(224, 129, 169, .19);
  border-radius: 14px;
  color:
    rgba(125, 69, 95, .57);
  cursor: pointer;
  background:
    rgba(255,255,255,.34);
}

.content {
  position: relative;
  z-index: 3;
  width: min(1210px, 100%);
  margin: 0 auto;
  padding-bottom: 100px;
}

.topbar {
  min-height: 90px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eyebrow {
  margin: 0 0 6px;
  color:
    rgba(195, 84, 133, .61);
  font-size: 9px;
  letter-spacing: .18em;
}

.topbar h1,
.section-heading h2 {
  margin: 0;
}

.topbar h1 {
  font-size: 27px;
}

.pink-button,
.soft-button,
.text-button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.pink-button {
  min-height: 44px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  color: #793e5d;
  font-weight: 800;
  background:
    linear-gradient(
      135deg,
      #ffc7dd,
      #ffe9b8
    );
  box-shadow:
    0 11px 28px
    rgba(221, 118, 162, .18);
  transition: .23s ease;
}

.pink-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 15px 33px
    rgba(221, 118, 162, .24);
}

.pink-button:disabled {
  cursor: wait;
  opacity: .62;
}

.soft-button {
  min-height: 44px;
  padding: 0 16px;
  border:
    1px solid
    rgba(221, 124, 166, .20);
  border-radius: 14px;
  color:
    rgba(123, 68, 94, .69);
  background:
    rgba(255,255,255,.40);
}

.text-button {
  color:
    rgba(130, 72, 99, .52);
  background: none;
}

.section-anchor {
  scroll-margin-top: 22px;
}

.hero {
  min-height: 400px;
  padding: 48px 50px;
  display: grid;
  grid-template-columns: 1.04fr .96fr;
  align-items: center;
  gap: 34px;
  border-radius: 31px;
  overflow: hidden;
}

.mini-badge {
  display: inline-block;
  margin-bottom: 13px;
  padding: 7px 11px;
  border-radius: 999px;
  color: #c15f8c;
  font-size: 9px;
  letter-spacing: .12em;
  background:
    rgba(255,255,255,.43);
}

.hero-copy h2 {
  max-width: 650px;
  margin: 0;
  font-size:
    clamp(38px, 5vw, 65px);
  line-height: 1.06;
  letter-spacing: -.05em;
}

.hero-copy h2 span {
  display: block;
  color:
    rgba(132, 75, 102, .52);
}

.hero-copy > p {
  max-width: 580px;
  margin: 22px 0 28px;
  color:
    rgba(123, 69, 95, .57);
  line-height: 1.9;
}

.hero-buttons {
  display: flex;
  gap: 10px;
}

.memory-board {
  min-height: 310px;
  position: relative;
  border:
    1px solid
    rgba(231, 141, 180, .18);
  border-radius: 28px;
  background:
    radial-gradient(
      circle,
      rgba(255,213,230,.43),
      transparent 61%
    ),
    rgba(255,255,255,.22);
}

.paper {
  position: absolute;
  z-index: 2;
  width: 135px;
  padding: 8px 8px 13px;
  border-radius: 7px;
  color: #9b5878;
  text-align: center;
  font-size: 9px;
  background:
    rgba(255,255,255,.89);
  box-shadow:
    0 13px 28px
    rgba(204, 101, 145, .14);
}

.paper div {
  height: 94px;
  margin-bottom: 8px;
  border-radius: 4px;
}

.paper-one {
  left: 7%;
  top: 15%;
  transform: rotate(-8deg);
}

.paper-one div {
  background:
    linear-gradient(
      135deg,
      #ffc7dd,
      #c1e5dc
    );
}

.paper-two {
  right: 8%;
  bottom: 10%;
  transform: rotate(7deg);
}

.paper-two div {
  background:
    linear-gradient(
      135deg,
      #f7cadd,
      #f6dda9
    );
}

.route {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color:
    rgba(211, 113, 157, .43);
}

.spark,
.heart {
  position: absolute;
  z-index: 3;
  color: #d66d9b;
}

.s1 {
  right: 15%;
  top: 10%;
}

.s2 {
  left: 46%;
  bottom: 15%;
}

.heart {
  left: 10%;
  bottom: 20%;
}

.stats {
  margin-top: 16px;
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 15px;
}

.stat {
  padding: 20px;
  display: grid;
  grid-template-columns:
    auto auto 1fr;
  align-items: center;
  gap: 12px;
  border-radius: 20px;
}

.stat > span {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  color: #d76c9a;
  background:
    rgba(255,255,255,.48);
}

.stat strong {
  font-size: 19px;
}

.stat p {
  margin: 0;
  color:
    rgba(127, 70, 97, .48);
  font-size: 10px;
}

.journey-section,
.mode-section {
  margin-top: 72px;
}

.section-heading {
  margin-bottom: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.empty {
  min-height: 230px;
  padding: 35px;
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
  border-radius: 25px;
}

.empty > span {
  color: #d8729e;
  font-size: 30px;
}

.empty h3 {
  margin: 10px 0 4px;
}

.empty p {
  margin: 0 0 18px;
  color:
    rgba(125, 70, 96, .51);
}

.journey-grid {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 16px;
}

.journey-card,
.new-card {
  border-radius: 25px;
  overflow: hidden;
  cursor: pointer;
  transition: .27s ease;
}

.journey-card:hover,
.new-card:hover {
  transform: translateY(-6px);
  box-shadow:
    0 24px 50px
    rgba(214, 109, 155, .16);
}

.cover {
  height: 190px;
  position: relative;
  background-position: center;
  background-size: cover;
  background-color: #f5c8da;
}

.cover.fallback {
  display: grid;
  place-items: center;
  background:
    radial-gradient(
      circle at 30% 30%,
      rgba(255,255,255,.58),
      transparent 25%
    ),
    linear-gradient(
      135deg,
      #fbc9dc,
      #edc5dc 45%,
      #f5dea8
    );
}

.fallback-symbol {
  color:
    rgba(255,255,255,.77);
  font-size: 52px;
}

.cover-mask {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to top,
      rgba(107, 53, 80, .23),
      transparent 55%
    );
}

.cover-top {
  position: absolute;
  z-index: 2;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
}

.status,
.visibility {
  padding: 6px 9px;
  border-radius: 999px;
  color: #8a4b69;
  font-size: 9px;
  background:
    rgba(255,255,255,.73);
  backdrop-filter: blur(8px);
}

.status.published {
  color: #a14c75;
  background:
    rgba(255, 226, 239, .84);
}

.card-body {
  padding: 20px 21px 19px;
}

.date {
  margin: 0;
  color: #c1628d;
  font-size: 9px;
  letter-spacing: .08em;
}

.card-body h3 {
  margin: 7px 0 7px;
  font-size: 20px;
}

.subtitle {
  height: 42px;
  margin: 0;
  overflow: hidden;
  color:
    rgba(125, 69, 95, .52);
  line-height: 1.65;
  font-size: 11px;
}

.card-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.open-button,
.publish-button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.open-button {
  padding: 0;
  color:
    rgba(120, 66, 91, .63);
  background: none;
}

.publish-button {
  padding: 8px 13px;
  border-radius: 999px;
  color: #7d405e;
  font-weight: 700;
  background:
    linear-gradient(
      135deg,
      #ffc8dc,
      #ffe9b7
    );
}

.published-text {
  color: #c25e8c;
  font-size: 10px;
}

.new-card {
  min-height: 310px;
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
}

.new-card > span {
  width: 55px;
  height: 55px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #d66c9a;
  font-size: 25px;
  background:
    linear-gradient(
      135deg,
      #ffd1e1,
      #fff0bd
    );
}

.new-card h3 {
  margin: 13px 0 4px;
}

.new-card p {
  margin: 0;
  color:
    rgba(126, 71, 97, .48);
}

.mode-grid {
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 15px;
}

.mode {
  min-height: 225px;
  padding: 26px;
  position: relative;
  border-radius: 24px;
  transition: .25s ease;
}

.mode:hover {
  transform: translateY(-5px);
}

.mode-num {
  color:
    rgba(134, 74, 102, .30);
  font-size: 9px;
  letter-spacing: .14em;
}

.mode > strong {
  display: block;
  margin-top: 29px;
  color: #d66b99;
  font-size: 27px;
}

.mode h3 {
  margin: 14px 0 8px;
}

.mode p {
  color:
    rgba(126, 70, 96, .52);
  font-size: 11px;
  line-height: 1.75;
}

.modal-mask {
  position: fixed;
  z-index: 1000;
  inset: 0;
  padding: 22px;
  display: grid;
  place-items: center;
  background:
    rgba(104, 56, 80, .22);
  backdrop-filter: blur(9px);
}

.create-modal {
  width: min(700px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
  padding: 29px;
  box-sizing: border-box;
  border:
    1px solid
    rgba(255,255,255,.80);
  border-radius: 28px;
  background:
    rgba(255, 246, 251, .94);
  box-shadow:
    0 30px 90px
    rgba(181, 78, 125, .22);
}

.modal-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.modal-heading h2 {
  margin: 0;
}

.close-button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  color: #9e5979;
  cursor: pointer;
  font-size: 22px;
  background:
    rgba(228, 133, 174, .10);
}

.create-form {
  margin-top: 25px;
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 16px;
}

.create-form label {
  display: block;
}

.create-form label.full,
.modal-actions.full,
.form-message {
  grid-column: 1 / -1;
}

.create-form label > span {
  display: block;
  margin-bottom: 8px;
  color:
    rgba(119, 64, 91, .73);
  font-size: 11px;
}

.create-form label b {
  color: #d35f90;
}

.create-form input,
.create-form textarea {
  width: 100%;
  box-sizing: border-box;
  border:
    1px solid
    rgba(231, 143, 181, .36);
  border-radius: 14px;
  outline: none;
  padding: 0 14px;
  color: #75425c;
  background:
    rgba(255,255,255,.72);
  transition: .2s ease;
}

.create-form input {
  height: 47px;
}

.create-form textarea {
  padding-top: 12px;
  resize: vertical;
}

.create-form input:focus,
.create-form textarea:focus {
  border-color: #ec8ab5;
  box-shadow:
    0 0 0 4px
    rgba(235, 132, 176, .10);
}

.visibility-options {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 11px;
}

.visibility-options button {
  padding: 15px;
  display: grid;
  gap: 4px;
  border:
    1px solid
    rgba(228, 132, 173, .20);
  border-radius: 15px;
  color:
    rgba(121, 66, 92, .66);
  cursor: pointer;
  text-align: left;
  background:
    rgba(255,255,255,.48);
}

.visibility-options button.active {
  border-color:
    rgba(222, 108, 157, .46);
  color: #7c3f5e;
  background:
    linear-gradient(
      135deg,
      rgba(255,205,225,.55),
      rgba(255,239,194,.45)
    );
}

.visibility-options small {
  opacity: .65;
}

.form-message {
  margin: 0;
  color: #c35d86;
  font-size: 11px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 4px;
}

.toast {
  position: fixed;
  z-index: 40;
  right: 28px;
  bottom: 28px;
  padding: 13px 17px;
  border:
    1px solid
    rgba(255,255,255,.72);
  border-radius: 15px;
  color: #814966;
  background:
    rgba(255,247,251,.91);
  box-shadow:
    0 18px 45px
    rgba(206, 105, 149, .18);
  backdrop-filter: blur(18px);
}

.modal-enter-active,
.modal-leave-active,
.toast-enter-active,
.toast-leave-active {
  transition: .22s ease;
}

.modal-enter-from,
.modal-leave-to,
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}

@media (max-width: 980px) {
  .me-page {
    grid-template-columns:
      88px 1fr;
  }

  .profile > div:last-child,
  .sidebar nav button:not(.active)
    > span + *,
  .soft-note,
  .logout {
    display: none;
  }

  .profile {
    justify-content: center;
  }

  .sidebar nav button {
    justify-content: center;
  }

  .hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .me-page {
    display: block;
    padding: 13px;
  }

  .sidebar {
    position: fixed;
    z-index: 20;
    top: auto;
    right: 13px;
    bottom: 13px;
    left: 13px;
    width: auto;
    height: 62px;
    padding: 7px;
  }

  .profile,
  .sidebar-bottom {
    display: none;
  }

  .sidebar nav {
    width: 100%;
    margin: 0;
    grid-template-columns:
      repeat(4, 1fr);
  }

  .sidebar nav button {
    padding: 0;
  }

  .content {
    padding-bottom: 95px;
  }

  .topbar {
    min-height: 76px;
  }

  .hero {
    min-height: auto;
    padding: 30px 24px;
  }

  .hero-copy h2 {
    font-size: 40px;
  }

  .stats,
  .journey-grid,
  .mode-grid {
    grid-template-columns: 1fr;
  }

  .create-form {
    grid-template-columns: 1fr;
  }

  .create-form label.full,
  .modal-actions.full,
  .form-message {
    grid-column: auto;
  }
}

.city-title{display:flex;align-items:center;gap:3px;min-height:58px;margin:0!important;line-height:1.2}
.city-title span{min-width:0;overflow-wrap:anywhere;flex:0 1 auto}
.collab-invite-button{border:0;border-radius:999px;padding:8px 10px;white-space:nowrap;cursor:pointer;color:#94496f;font-size:11px;background:#f7e1ed}
.card-actions{gap:8px;flex-wrap:wrap}
/* TRAVEL_SOCIAL_V121: preserve original sidebar and swap only right content */
.content:has(.hub-inline){min-width:0}

.sidebar{top:calc(var(--tm-nav-height) + 16px);max-height:calc(100dvh - var(--tm-nav-height) - 32px);overflow:auto}
@media(max-width:900px){.sidebar{max-height:none;position:relative;top:auto}.sidebar nav{display:flex;flex-wrap:wrap;gap:6px}}

@media(max-width:980px){
 .me-page{display:block;padding:14px}.sidebar{position:relative;inset:auto;height:auto;width:auto;max-height:none;padding:10px;margin-bottom:16px}
 .sidebar .profile,.sidebar .sidebar-bottom{display:none}.sidebar nav{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;margin:0;width:100%}
 .sidebar nav button{flex:0 0 auto;justify-content:center;padding:10px 14px;height:42px}.content{padding-bottom:16px}
}

.me-page{color:var(--tm-ink);background:var(--tm-night);grid-template-columns:clamp(192px,19vw,246px) minmax(0,1fr);padding:var(--tm-gutter);overflow:clip}
.page-overlay{pointer-events:none;background:rgba(245,178,207,var(--tm-overlay-alpha,.15))}
.glass{background:var(--tm-sheet);border-color:var(--tm-line);box-shadow:var(--tm-lift);backdrop-filter:none}
.sidebar{border-radius:6px}
.sidebar .profile h2,.sidebar nav button,.sidebar .logout{color:var(--tm-ink)}
.sidebar .profile p,.sidebar .profile span{color:var(--tm-muted)}
.sidebar nav button.active{background:#dfebe1;color:#234939;box-shadow:none}
.sidebar nav button span{color:var(--tm-accent)}
.content{width:min(100%,var(--tm-width));margin-inline:auto}
.topbar{background:var(--tm-paper);padding:15px clamp(14px,2.6vw,30px);border-block:1px solid var(--tm-line);margin-bottom:16px}
.topbar h1,.section-heading h2{font-family:var(--tm-display);color:var(--tm-ink);overflow-wrap:anywhere}
.topbar .eyebrow{color:var(--tm-accent);font:600 .67rem/1.5 var(--tm-index);letter-spacing:.12em}
.pink-button{background:var(--tm-accent);color:#fffdf5;border-radius:5px;min-height:44px;box-shadow:none}
.soft-button{background:var(--tm-sheet);color:var(--tm-accent);border:1px solid var(--tm-line);border-radius:5px;min-height:44px}
.stats{gap:1px;background:var(--tm-line);border:1px solid var(--tm-line)}
.stat{border:0;border-radius:0;box-shadow:none;min-width:0}
.stat p{color:var(--tm-muted)}
.stat > span{color:var(--tm-accent);background:#e8ede4}
.section-heading{padding:15px 18px;background:var(--tm-paper);border-block:1px solid var(--tm-line)}
.section-heading .tm-kicker{margin:0 0 5px;color:var(--tm-muted)}
.text-button{color:var(--tm-accent);min-height:44px}
.empty p{color:var(--tm-muted)}
.topbar-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.appearance-panel{position:relative;z-index:5;padding:20px 24px;margin:0 0 18px;border-radius:20px;display:grid;gap:16px}
.appearance-title{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;color:#824963}
.appearance-title span,.appearance-help,.appearance-controls span{font-size:12px;color:#a26f88}
.appearance-panel label{display:grid;grid-template-columns:1fr auto;gap:10px;color:#86516c;font-size:13px}
.appearance-panel input[type=range]{grid-column:1/-1;width:100%;accent-color:#c76594;cursor:pointer}
.appearance-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.appearance-help{margin:0}
#overview.hero{position:relative;display:flex;min-height:clamp(365px,46vw,555px);padding:clamp(24px,4.3vw,65px);align-items:center;isolation:isolate;overflow:hidden;border-radius:6px;background:#172534;color:var(--tm-sheet)}
.overview-art,.overview-art::after{position:absolute;inset:0}
.overview-art{z-index:-1;background:var(--tm-overview-art) 64% center / cover no-repeat}
.overview-art::after{content:'';background:linear-gradient(90deg,#101d29ec,#101d2992 52%,#101d2920 100%)}
.overview-credit{position:absolute;right:14px;bottom:12px;color:#fff;background:#111d29b8;padding:5px 9px}
#overview .hero-copy{z-index:1;max-width:min(650px,78%)}
#overview .hero-copy .tm-kicker{color:#f9d1c8}
#overview .hero-copy h2{margin:16px 0;font:700 clamp(2.1rem,4vw,4.15rem)/1.15 var(--tm-display);letter-spacing:-.055em}
#overview .hero-copy h2 span{color:var(--tm-rose);display:block;font-size:.83em;margin-top:.1em;text-wrap:balance}
#overview .hero-copy>p{color:#f6efe8;max-width:500px}
#overview .hero-buttons{margin-top:24px}
.journey-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(16px,2.5vw,34px);padding:4px 8px 20px 0}
.journey-card{min-width:0;position:relative;overflow:visible;border-radius:5px;box-shadow:5px 5px 0 -1px #d3d7c9,5px 5px 0 var(--tm-line),var(--tm-lift);transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column}
.journey-card:hover{transform:translateY(-4px);box-shadow:5px 7px 0 -1px #d3d7c9,5px 7px 0 var(--tm-line),0 18px 38px #162e2460}
.journey-card .cover{height:auto;aspect-ratio:16 / 9;min-height:165px;border-radius:4px 4px 0 0;overflow:hidden}
.journey-card .cover-mask{background:linear-gradient(0deg,#0b18189c,transparent 45%);pointer-events:none}
.status,.visibility{background:var(--tm-sheet);color:var(--tm-ink);border-radius:3px;font:600 .66rem/1.4 var(--tm-index);backdrop-filter:none}
.status.published{color:#214636;background:#e0eddf}
.journey-card .card-body{flex:1;display:flex;flex-direction:column;padding:16px clamp(12px,2vw,24px) 19px;border-radius:0 0 4px 4px;background:linear-gradient(110deg,#fffdf5 25%,#fffdf5bd 100%),var(--tm-street) 62% 60% / cover no-repeat}
.journey-card .date{display:flex;align-items:center;gap:8px;color:var(--tm-muted);font:600 .7rem/1.5 var(--tm-index);flex-wrap:wrap}
.volume-number{color:var(--tm-accent);border-right:1px solid var(--tm-line);padding-right:8px}
.journey-card .city-title{min-height:0;margin:9px 0!important;font:700 clamp(1.25rem,2.7vw,2rem)/1.16 var(--tm-display)}
.journey-card .subtitle{height:auto;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:30px;color:var(--tm-muted);font-size:.82rem}
.journey-card .card-actions{margin-top:auto;padding-top:12px;justify-content:flex-start;gap:10px}
.journey-card button{white-space:nowrap;min-height:36px}
.open-button{color:var(--tm-accent);font-weight:700}
.publish-button,.collab-invite-button{background:#e3ece1;color:#234b3b;border-radius:4px}
.new-card{min-height:220px;display:grid;place-content:center;justify-items:center;gap:7px;border:1px dashed var(--tm-line);border-radius:5px;background:#f7f4eadd;color:var(--tm-accent);font:inherit}
.new-card span{font-size:1.6rem;color:inherit}
@media(min-width:1150px){.journey-card:first-child:nth-last-child(n+3){grid-column:span 2;display:grid;grid-template-columns:1.38fr 1fr}.journey-card:first-child:nth-last-child(n+3) .cover{height:100%;aspect-ratio:16 / 8;border-radius:4px 0 0 4px}}
@media(max-width:980px){
 .me-page{display:block;padding:14px}
 .sidebar .sidebar-bottom{display:flex;position:absolute;top:10px;right:10px;bottom:auto;margin:0}
 .sidebar .soft-note{display:none}
 .sidebar .profile{display:flex;justify-content:flex-start;padding:3px 86px 9px 3px}
 .sidebar .profile > div:last-child{display:block;min-width:0;overflow-wrap:anywhere}
 .sidebar .logout{display:block;padding:5px 8px;min-height:42px;white-space:nowrap}
 .sidebar nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:visible;gap:3px}
 .sidebar nav button{padding:4px 1px;gap:3px;font-size:clamp(.69rem,2.75vw,.84rem);border-radius:4px;min-width:0;white-space:nowrap}
 .sidebar nav button > span:first-child{display:none}
}
@media(max-width:650px){
 .topbar{gap:10px;flex-wrap:wrap;padding:14px}.topbar-actions{gap:7px}
 #overview.hero{min-height:405px;padding:36px 20px 62px;align-items:flex-end}
 #overview .hero-copy{max-width:100%}
 #overview .hero-copy h2{font-size:clamp(1.85rem,8vw,3rem)}
 .overview-art::after{background:linear-gradient(0deg,#101d29f5,#101d29b5 59%,#101d292b)}
 #overview .hero-buttons{flex-wrap:wrap}
 .journey-grid{grid-template-columns:minmax(0,1fr)}
 .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
 .stats .stat{padding:10px 7px;display:flex;flex-direction:column;text-align:center;gap:6px}
 .stat>span{display:none}
}
@media(prefers-reduced-motion:reduce){.journey-card,.journey-card:hover,.new-card,.new-card:hover{transition:none;transform:none}}
</style>
