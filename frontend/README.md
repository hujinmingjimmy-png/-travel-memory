# hello_vue3

## 一键启动 Travel Memory

在 Windows 上双击 `backend/start.cmd`，或在项目根目录的 PowerShell 中执行 `.\backend\start.cmd`。
脚本会准备 Vue 的依赖、构建最新页面并启动 Spring Boot。启动后访问 [http://localhost:8080/](http://localhost:8080/)，按 Ctrl+C 停止。
本机需要 JDK 17 或以上版本、满足 `package.json` 要求的 Node.js，以及按后端配置运行的 MySQL。

执行 `.\backend\start.cmd package` 可打出前后端合一的发布 JAR。服务器配置和数据库初始化步骤见 [公网部署说明](../deploy/README.md)。

需要前端热更新时，可以继续使用下面的 Vite 开发流程。

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
