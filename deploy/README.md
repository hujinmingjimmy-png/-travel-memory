# Travel Memory 公网部署

这里以单台 Linux 服务器、MySQL 8 和 Nginx 为例。Windows 上仍可双击 `backend/start.cmd`，本地访问 `http://localhost:8080`。

## 生成发布包

在项目根目录执行以下命令。构建机需要 JDK 17 或以上版本，以及满足前端版本要求的 Node.js。命令会构建 Vue、运行后端测试并生成 `backend/target/user-0.0.1-SNAPSHOT.jar`。运行服务器只需要 Java 和数据库。

```powershell
.\backend\start.cmd package
```

如果要启用高德地图，在构建前给 `VITE_AMAP_KEY` 设置公网域名对应的 Web 端 Key。发布包使用同源 `/_AMapService`，安全密钥应填写到服务器上的 Nginx 私有配置。公网地图需在实际域名上完成验收。[高德地图安全密钥文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

## 准备数据库与存储

新站点使用空的 MySQL 8 数据库，字符集为 `utf8mb4`。用数据库管理员将 [初始化结构](../sql/000_schema.sql) 导入目标库，再给应用账号授予该库的 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 权限。已有站点应使用源库的备份还原，并将原来的照片、头像、外观图片、私聊附件、共创附件和影片复制到各自的持久目录。已有库的表结构升级应根据当前版本逐项核对 `sql/001` 到 `sql/006`。

## 在服务器上运行

1. 创建系统账号和组 `travel-memory`，将 JAR 安装为 `/opt/travel-memory/travel-memory.jar`。
2. 复制 [环境变量模板](travel-memory.env.example) 到 `/etc/travel-memory/travel-memory.env`，填入数据库连接和新生成的 JWT 签名密钥。可用 `openssl rand -hex 32` 生成密钥。将文件权限设为 `0600`。生产环境请使用新凭据。
3. 将 [systemd 配置](travel-memory.service) 安装到 `/etc/systemd/system/travel-memory.service`，执行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now travel-memory`。用 `curl -f http://127.0.0.1:8080/` 确认应用已响应。
4. 将真实域名指向服务器并签发 TLS 证书。修改 [Nginx 模板](nginx.conf.example) 的域名和证书路径后加载到 Nginx。启用高德时，另将 [高德代理模板](amap.conf.example) 放到 `/etc/travel-memory/amap.conf`，填入服务器密钥并启用 include。执行 `sudo nginx -t` 后再重载。生产配置让 Spring Boot 监听本机回环地址，Nginx 负责 HTTPS、转发 WebSocket 和限制登录注册请求频率。[Spring Boot 代理配置](https://docs.spring.io/spring-boot/how-to/webserver.html) · [Nginx WebSocket](https://nginx.org/en/docs/http/websocket.html) · [Nginx 限流](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)

发布后用真实域名验收登录、创建旅程、照片上传、公开和私密访问、实时消息及分享链接。启用地图和影片时，再确认高德瓦片、WebGL、FFmpeg 和配音服务。更新版本前备份数据库及持久目录，并保留上一版 JAR 供回退。

本机开发凭据放在 Git 忽略的 `backend/application-local.yml`，或以 `DB_URL`、`DB_USERNAME`、`DB_PASSWORD`、`JWT_SECRET` 环境变量提供。该本地文件不会进入发布包。
