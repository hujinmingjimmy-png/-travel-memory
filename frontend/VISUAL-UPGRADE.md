# Travel Memory · A World of Memories

「每个人的世界，都值得被收藏。」这一轮在现有 Vue 3 工程中完成，范围是首页、我的概览和旅程、旅行详情、真实地图与发现页。

| 方向 | 画面与交互 | 功能适配、移动端与成本 |
| --- | --- | --- |
| Cinematic Atlas | 大幅影像、夜色放映空间、带编号的地图路线 | 适合首页、播放和地图；小屏保留主画面与主要操作；成本中等 |
| The Memory Archive | 纸本目录、卷号、宽幅头条、照片与文字并排的档案 | 最适合反复浏览与长期收藏；可重排成单列，成本较低 |
| Beyond the Journey | 大幅错层、非对称构图、以空间运动切换内容 | 单次探索辨识度高；窄屏与键盘导航需要额外设计；成本较高 |

采用 **The Memory Archive** 作为主线，把 **Cinematic Atlas** 用在开场、旅行封面、放映与地图。纸白用于阅读，森林绿用于操作与路线，深墨色用于影像场景，柔粉只在封面文字和原有外观偏好中出现。中文标题使用本机宋体族，英文标题使用 Georgia，编号使用等宽字体；常规界面使用系统无衬线字体。桌面留白、44px 主要操作区、图片比例、焦点提示和减少动态效果的规则由共用样式提供。

## 修改文件

| 文件 | 改动 |
| --- | --- |
| `public/images/油画.jpg` | 用户提供的原图。用于「我的」概览默认底图及首页无照片时的封面 |
| `src/assets/main.css`、`src/App.vue`、`src/router/index.ts`、`src/components/GlobalNav.vue` | 设计变量、纸本导航、页面进入和滚动定位 |
| `src/components/Home.vue` | 电影开场、创作入口、个人放映区；有照片时使用自己的旅行封面 |
| `src/components/Me.vue` | 概览图片与 HTML 内容分层，账号背景优先；档案统计、叠页收藏、封面编号和移动端个人导航 |
| `src/components/JourneyCover.vue` | 共用封面：JWT 图片、已有图片链接、相册回退、樱花街景兜底；按可见范围加载并释放临时 URL |
| `src/components/Discover.vue`、`src/components/DiscoverTravelCard.vue`、`src/components/AuthorProfile.vue` | 樱花背景、旅行杂志头条与网格、搜索与筛选、作者和互动；作者页复用封面组件 |
| `src/components/JourneyDetail.vue`、`src/components/TravelPhotoGallery.vue`、`src/components/TravelStoryTimeline.vue` | 旅行大图、地图／故事／播放索引、摄影时间线、相册键盘预览 |
| `src/components/TravelMapModes.vue`、`src/components/TravelRealMapEditor.vue` | 地图样式、路线对比、真实坐标索引与按需加载 3D |

## 验收记录

- `npm run build` 通过，含 `vue-tsc` 静态检查。现有 3D 渲染包仍触发 Vite 体积提示；该包只在打开 3D 场景时加载。
- 后端现有 `TravelPermissionsTest` 与 `TravelRouteSnapshotServiceTest` 共 18 项通过。后端源码、数据库、接口和鉴权规则均未改动。
- 使用 Chrome 对生产构建验证 1440、820、390、320px 视口。浏览器测试用隔离数据覆盖创作入口、「油画」默认与恢复、自定义概览背景、授权封面、缺图回退、发现搜索与喜欢、公开访客与私密拒绝、故事定位、相册方向键及 Esc、减少动态效果。地图定位使用测试数据与现有接口契约；未在此项测试中验证线上高德瓦片与 WebGL 场景。
- 发现继续使用现有公开且已发布旅行接口。个人照片与背景通过现有 JWT 读取；私密共创旅行遵守原有媒体权限。打开地图不新增记忆点，原有路线快照仍由后端按旅行 ID 管理。旅行电影未作为独立发现栏目恢复；现有视频和共创入口保留。

在 Windows 上双击 `backend/start.cmd`，即可构建当前页面并从 Spring Boot 的 `http://localhost:8080/home` 查看。
