# Phi Theme Studio

[English](./README_en.md)

基于 [GrapesJS](https://github.com/GrapesJS/grapesjs) 的 phi-plugin 可视化主题包编辑器。从浏览器中的查分结果画布直接生成可安装的主题 ZIP，不需要手写 `info.yaml`。

在线编辑器：[https://lyh2011.github.io/phi-theme-studio/](https://lyh2011.github.io/phi-theme-studio/)

![Phi Theme Studio 编辑器](./docs/editor.png)

## 功能

- B19、B27、B30、B33（Overflow）及 B30 数据分析五种预览
- GrapesJS 语义元素选择与拖动，修改会生成 phi-plugin 运行时可用的稳定选择器 CSS
- 画布支持最高 300% 缩放，放大后可按住鼠标右键平移；工具栏支持缩放与自动适应画布
- 语义元素和自定义元素均可拖动、调整宽高，拖动距离会按当前画布缩放精确换算；按住 `Shift` 拖动可临时关闭自动对齐
- 右侧面板支持布局、文字、外观、变换以及 SVG `fill`、`stroke` 编辑；颜色字段使用系统取色器
- 字号、宽高、位置等数值控件默认使用 `px`，旋转默认使用 `deg`，也可在控件中切换单位或直接输入完整 CSS 值
- 多维度雷达图、标签排行、直方图等数据分析元素定制
- 可点击或从左栏拖放文字、矩形、圆形、三角形、线条，也可上传图片作为画布元素
- 预览默认使用 phi-plugin 的 PHI 字体，自定义主题字体可覆盖它
- 主题名称、ID、作者、说明及四难度色配置，难度色实时应用到预览
- 背景、字体和九种评级图标资源管理
- 导入现有 phi-plugin 主题 ZIP
- 导出可直接解压到 `resources/html/b19/themes/` 的主题 ZIP
- `studio.json` 保存可编辑配置，ZIP 可再次导入编辑
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
2. 切换结果预览，在画布中选择或拖动语义元素，通过右侧“样式”面板编辑布局、尺寸、颜色与外观；需要完全跟随指针微调时按住 `Shift` 拖动。
3. 画布放大后，按住鼠标右键拖动以查看超出工作区的区域；点击缩放百分比或“适应画布”可重新居中。
4. 在左侧“组件”的“自定义元素”区域添加文字或基础图形；选择“上传图片”可把本地素材加入画布。
5. 在“主题”和“资源”中配置元数据、颜色、背景、字体与图标。
6. 在“导出”中通过校验后生成 ZIP。
7. 将 ZIP 解压到 phi-plugin 的 `resources/html/b19/themes/`。
8. 使用 `/myset 主题 <ID>` 选择主题。

## 导出结构

```text
my-theme/
├── info.yaml
├── b19.css
├── b19.art                 # 添加画布自定义元素或使用高级模板时生成
├── studio.json
└── assets/
    ├── background.webp
    ├── font.woff2
    ├── custom/             # 上传到画布的自定义图片
    │   └── image.png
    └── rating/
        ├── FC.png
        └── phi.png
```

默认导出的 `b19.css` 以以下内容开头：

```css
@import "../../b19.css";
```

未添加自定义元素时，主题只保存 GrapesJS 产生的覆盖规则，并继续使用 phi-plugin 当前版本的查分模板和基础样式。五种预览共用同一套主题 CSS；`studio.json` 仅供编辑器恢复可编辑配置，phi-plugin 会忽略该文件。

画布中新增的文字、图形和图片会同时保存在 `studio.json`，并注入导出包内真实的 `b19.art`，因此 phi-plugin 渲染结果会包含这些元素。上传图片会写入 `assets/custom/`，模板通过 `{{themeInfo.baseUrl}}` 引用包内路径。此时 `info.yaml` 会自动包含 `template: b19.art`。

## 高级模板

“源码”面板支持保留或编辑现有主题的 `b19.art`。一旦内容非空，导出包会包含 `template: b19.art` 并覆盖插件内置模板。没有手写模板但添加了画布自定义元素时，编辑器会以 phi-plugin 的真实模板为基础自动生成 `b19.art`。

ArtTemplate 包含 `{{each}}`、`{{if}}` 等运行时语句，不能安全地通过 GrapesJS HTML 解析器往返处理。因此可视化画布只编辑展开后的固定预览结构和 CSS；手写或导入的控制流仍作为不透明源码保存，编辑器只在导出时向其中追加画布自定义元素。

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
