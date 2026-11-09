# Travel Memory · 漫步旅行

旅行照片、故事、真实地图与足迹的私人档案。Vue 3 前端与 Spring Boot 后端通过同一地址提供页面和 API。可将旅行发布到发现页，也可邀请同行者共创。

## 本地启动

1. 安装 JDK 17+、Node.js 22.18+ 或 24.12+（按 `frontend/package.json` 的版本范围）和 MySQL 8。
2. 新建一个使用 `utf8mb4` 的空数据库，例如 `travel_memory`，导入 [数据库结构](sql/000_schema.sql)。已有数据请按 [部署说明](deploy/README.md) 迁移。
3. 将 `backend/application-local.example.yml` 复制为 `backend/application-local.yml`，填写数据库账号、密码和随机生成的 JWT 密钥。JWT 密钥至少 32 字节，例如用 `openssl rand -hex 32` 生成。
4. 在 Windows 双击 `backend/start.cmd`，或从项目根目录执行 `.\backend\start.cmd`。等待启动完成后打开 [http://localhost:8080/](http://localhost:8080/)。

本地要启用高德地图，可将 `frontend/.env.example` 复制为 `frontend/.env.local` 并填写配置。

## 发布

在 Windows 执行 `.\backend\start.cmd package`，打包生成 `backend/target/user-0.0.1-SNAPSHOT.jar`。数据库、反向代理和生产配置见 [公网部署说明](deploy/README.md)。

3D 模型来自 Kenney，使用的模型及 CC0 许可说明位于 `frontend/public/models/cartoon-world/`。界面图片单独管理，公开仓库前请确认其再分发权限。
