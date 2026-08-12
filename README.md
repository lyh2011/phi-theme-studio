# Phi Theme Studio

[English](./README_en.md)

基于 [GrapesJS](https://github.com/GrapesJS/grapesjs) 的 phi-plugin 可视化主题包编辑器。从浏览器中的 B30 画布直接生成可安装的主题 ZIP，不需要手写 `info.yaml`。

在线编辑器：[https://lyh2011.github.io/phi-theme-studio/](https://lyh2011.github.io/phi-theme-studio/)

![Phi Theme Studio 编辑器](./docs/editor.png)

## 功能

- GrapesJS B30 可视化画布、图层树和样式检查器
- 组件级布局、文字、外观和效果编辑
- 主题名称、ID、作者、说明及四难度色配置
- 背景、字体和九种评级图标资源管理
- 导入现有 phi-plugin 主题 ZIP
- 导出可直接解压到 `resources/html/b19/themes/` 的主题 ZIP
- `studio.json` 无损保存 GrapesJS 工程，ZIP 可再次导入编辑
- IndexedDB 本地自动保存、撤销/重做、源码高级模式
- 资源路径、CSS、ZIP Slip、文件数量和大小校验
- 不可信 `studio.json` 脚本拦截与 ZIP 解压大小限制
- 桌面与移动端工作台布局

## 使用

```bash
npm install
npm run dev
```

开发服务器默认运行于 `http://localhost:5173`。

1. 新建主题，或通过顶部“导入”载入已有 ZIP。
2. 在画布中选择语义组件，通过右侧“样式”面板编辑外观。
3. 在“主题”和“资源”中配置元数据、颜色、背景、字体与图标。
4. 在“导出”中通过校验后生成 ZIP。
5. 将 ZIP 解压到 phi-plugin 的 `resources/html/b19/themes/`。
6. 使用 `/myset 主题 <ID>` 选择主题。

## 导出结构

```text
my-theme/
├── info.yaml
├── b19.css
├── studio.json
└── assets/
    ├── background.webp
    ├── font.woff2
    └── rating/
        ├── FC.png
        └── phi.png
```

默认导出的 `b19.css` 以以下内容开头：

```css
@import "../../b19.css";
```

因此主题只保存 GrapesJS 产生的覆盖规则，并继续使用 phi-plugin 当前版本的 B30 模板和基础样式。`studio.json` 仅供编辑器恢复工程，phi-plugin 会忽略该文件。

## 高级模板

“源码”面板支持保留或编辑现有主题的 `b19.art`。一旦内容非空，导出包会包含 `template: b19.art` 并覆盖插件内置模板。

ArtTemplate 包含 `{{each}}`、`{{if}}` 等运行时语句，不能安全地通过 GrapesJS HTML 解析器往返处理。因此可视化画布只编辑展开后的固定 B30 样例和 CSS；自定义 `b19.art` 始终作为不透明源码保存。

## 校验边界

- 导出 ID 必须匹配 `^[a-z][a-z0-9_-]*$`
- 禁止与 `default`、`snow`、`star`、`dss2`、`topText`、`foolsDay` 冲突
- ZIP 顶层目录自动与主题 ID 保持一致
- 资源路径禁止绝对路径、`..`、反斜杠、协议 URL、query 和 hash
- CSS 禁止远程 `@import`、`javascript:` 和不安全资源 URL
- 单个资源不超过 20 MB，主题 ZIP 不超过 50 MB，最多 128 个文件

自定义 `b19.art` 属于可信管理员代码。安装第三方模板前仍需进行代码审查。

## 开发命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

GitHub Pages 构建可通过 `VITE_BASE_PATH` 指定部署子路径：

```bash
VITE_BASE_PATH=/phi-theme-studio/ npm run build
```

## 技术栈

- React 19 + TypeScript + Vite
- GrapesJS 0.23
- JSZip + YAML
- PostCSS + postcss-value-parser
- IndexedDB（idb-keyval）
- Vitest + Playwright

## 许可证

本项目采用 [GPL-3.0](./LICENSE)。预览结构、基础样式与演示资源派生自 [Catrong/phi-plugin](https://github.com/Catrong/phi-plugin)，详见 [NOTICE](./NOTICE)。GrapesJS 本身采用 BSD-3-Clause 许可证。
