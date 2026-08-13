// Renders docs/使用指南.md from the same content the in-app guide uses, so the
// two can never drift apart. Run with `npm run docs:guide`.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { GUIDE_STEPS } = await import('../src/lib/guideContent.ts')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SCREENSHOTS = {
  intro: { src: './editor.png', alt: 'Phi Theme Studio 编辑器界面' },
}

function renderBlock(block) {
  if (block.kind === 'text') return block.text
  if (block.kind === 'tip') return `> [!TIP]\n> ${block.text}`
  if (block.kind === 'code') return '```text\n' + block.text + '\n```'
  if (block.kind === 'qa') {
    return block.items.map((item) => `**${item.label}**\n\n${item.text}`).join('\n\n')
  }
  return block.items.map((item) => `- **${item.label}**：${item.text}`).join('\n')
}

const body = GUIDE_STEPS.map((step) => {
  const shot = SCREENSHOTS[step.id]
  return [
    `## ${step.nav}：${step.title}`,
    '',
    `*${step.lead}*`,
    '',
    ...(shot ? [`![${shot.alt}](${shot.src})`, ''] : []),
    step.blocks.map(renderBlock).join('\n\n'),
  ].join('\n')
}).join('\n\n')

const page = `<!-- 本文件由 scripts/build-guide.mjs 生成，请勿直接编辑；内容源在 src/lib/guideContent.ts -->

# Phi Theme Studio 使用指南

面向第一次使用的玩家。做一个 phi-plugin 查分图主题，全程不需要懂 CSS。

在线编辑器：<https://lyh2011.github.io/phi-theme-studio/>

编辑器右上角的问号按钮可以随时打开同一份指南，手机上也能用。

${body}

## 还有问题

到 [Issues](https://github.com/lyh2011/phi-theme-studio/issues) 反馈，说清楚你卡在哪一步、看到了什么。
`

writeFileSync(join(root, 'docs', '使用指南.md'), page)
console.log(`docs/使用指南.md updated (${GUIDE_STEPS.length} sections)`)
