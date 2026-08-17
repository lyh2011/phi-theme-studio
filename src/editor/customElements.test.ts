import { describe, expect, it } from 'vitest'
import type { ProjectData } from 'grapesjs'
import baseB19Art from '../theme/base-b19.art?raw'
import {
  buildCustomTemplate,
  collectCustomNodes,
  compactProjectData,
  sourceTemplateForEditing,
  templateForProject,
} from './customElements'

function projectWith(...components: Record<string, unknown>[]) {
  return {
    pages: [{ frames: [{ component: { type: 'wrapper', components } }] }],
    styles: [],
  } as unknown as ProjectData
}

function customNode(
  kind: string,
  attributes: Record<string, unknown> = {},
  content = '',
) {
  return {
    tagName: kind === 'image' ? 'img' : 'div',
    content,
    classes: [`phi-custom-${kind}-test`],
    attributes: {
      'data-gjs-name': 'editor-only name',
      'data-phi-selector': `.phi-custom-${kind}-test`,
      'data-phi-custom': kind,
      ...attributes,
    },
  }
}

describe('custom element project data', () => {
  it('collects only supported custom nodes from nested GrapesJS frames', () => {
    const text = customNode('text', {}, '标题')
    const image = customNode('image', { src: 'assets/custom/cover.png' })
    const unsupported = customNode('video')
    const project = projectWith({
      tagName: 'section',
      components: [text, { tagName: 'div', components: [image, unsupported] }],
    })

    expect(collectCustomNodes(project)).toEqual([text, image])
  })

  it('compacts fixed fixture DOM while preserving custom element subtrees', () => {
    const custom = customNode('text', {}, '')
    Object.assign(custom, {
      components: [
        { type: 'textnode', content: '保留 ' },
        { tagName: 'strong', components: [{ type: 'textnode', content: '富文本' }] },
      ],
    })
    const project = {
      ...projectWith({
        tagName: 'main',
        attributes: { 'data-large-fixed-fixture': 'x'.repeat(100_000) },
        components: [{ tagName: 'section' }],
      }, custom),
      styles: [{ selectors: ['fixed'], style: { color: 'red' } }],
    } as unknown as ProjectData

    const compact = compactProjectData(project)

    expect(JSON.stringify(compact)).not.toContain('data-large-fixed-fixture')
    expect((compact as { styles?: unknown[] }).styles).toEqual([])
    expect(collectCustomNodes(compact)).toEqual([custom])
  })
})

describe('custom element ArtTemplate generation', () => {
  it('injects escaped text and attributes before the closing block', () => {
    const project = projectWith(customNode('text', {
      title: 'A & B "quoted" <value>',
    }, '<strong>Tom & "Jerry"\'s</strong>'))
    const result = buildCustomTemplate('<main>base</main>\n{{/block}}', project)

    expect(result).toContain('<!-- phi-theme-studio custom elements:start -->')
    expect(result).toContain('title="A &amp; B &quot;quoted&quot; &lt;value&gt;"')
    expect(result).toContain('&lt;strong&gt;Tom &amp; &quot;Jerry&quot;&#39;s&lt;/strong&gt;')
    expect(result).not.toContain('data-gjs-name=')
    expect(result.indexOf('phi-theme-studio custom elements')).toBeLessThan(result.indexOf('{{/block}}'))
  })

  it('rewrites packaged image sources to the phi-plugin theme base URL', () => {
    const project = projectWith(customNode('image', {
      src: 'assets/custom/user image.png',
      alt: 'A & B',
    }))
    const result = buildCustomTemplate('{{block "main"}}\n{{/block}}', project, new Set(['assets/custom/user image.png']))

    expect(result).toContain('src="{{themeInfo.baseUrl}}assets/custom/user image.png"')
    expect(result).toContain('alt="A &amp; B"')
  })

  it('rejects missing image resources and ArtTemplate expressions in text', () => {
    const image = projectWith(customNode('image', { src: 'assets/custom/missing.png' }))
    expect(() => buildCustomTemplate('{{/block}}', image, new Set())).toThrow(/缺少自定义图片资源/)

    const text = buildCustomTemplate('{{/block}}', projectWith(customNode('text', {}, '{{danger}}')))
    expect(text).toContain('&#123;&#123;danger&#125;&#125;')
    expect(text).not.toContain('<div class="phi-custom-text-test" data-phi-selector=".phi-custom-text-test" data-phi-custom="text">{{danger}}</div>')
  })

  it('does not duplicate an existing generated marker', () => {
    const project = projectWith(customNode('rect'))
    const once = buildCustomTemplate('{{block "main"}}\n{{/block}}', project)
    const twice = buildCustomTemplate(once, project)

    expect(twice.replace(/\s+/g, ' ')).toBe(once.replace(/\s+/g, ' '))
    expect(twice.match(/phi-theme-studio custom elements:start/g)).toHaveLength(1)
  })

  it('appends markup when the source has no closing block', () => {
    const result = buildCustomTemplate('<main>legacy template</main>', projectWith(customNode('line')))

    expect(result).toMatch(/<main>legacy template<\/main>\n<!-- phi-theme-studio custom elements:start -->\n<div[^>]+data-phi-custom="line"[^>]*><\/div>\n<!-- phi-theme-studio custom elements:end -->\n$/)
  })

  it('uses the real bundled template only when custom elements need one', () => {
    const emptyProject = projectWith()
    expect(templateForProject('  <main>custom</main>  ', emptyProject)).toBe('<main>custom</main>')
    expect(templateForProject('   ', emptyProject)).toBe('')

    const generated = templateForProject('', projectWith(customNode('circle')))
    expect(generated).toMatch(/{{block ['"]main['"]}}/)
    expect(generated).toContain('data-phi-custom="circle"')
    expect(generated).toContain('{{/block}}')
  })

  it('keeps the plugin base stylesheet when a generated template uses overlay CSS', () => {
    const generated = templateForProject('', projectWith(customNode('circle')))

    expect(generated).toContain('themeInfo.cssMode == "replace"')
    expect(generated).toContain('{{_res_path}}html/b19/b19.css')
    expect(generated).toContain('themeInfo.icons[song.Rating]')
    expect(generated).not.toContain('ratingIcons')
    expect(generated).not.toContain('ratingIconStyles')
  })

  it('replaces generated elements after re-import and strips the bundled base from source editing', () => {
    const first = templateForProject('', projectWith(customNode('text', {}, 'old')))
    const second = templateForProject(first, projectWith(customNode('text', {}, 'new')))

    expect(second).toContain('>new</div>')
    expect(second).not.toContain('>old</div>')
    expect(second.match(/phi-theme-studio custom elements:start/g)).toHaveLength(1)
    expect(sourceTemplateForEditing(first)).toBe('')
    expect(templateForProject(first, projectWith())).toBe('')
  })

  it('preserves an explicitly supplied template even when it matches the bundled template', () => {
    expect(sourceTemplateForEditing(baseB19Art, true)).not.toBe('')
    expect(templateForProject(baseB19Art, projectWith())).not.toBe('')
  })

  it('serializes GrapesJS textnode children without wrapper divs', () => {
    const { content: _content, ...node } = customNode('text')
    Object.assign(node, {
      type: 'text',
      components: [
        { type: 'textnode', content: 'Hello ' },
        { tagName: 'strong', components: [{ type: 'textnode', content: 'world' }] },
      ],
    })
    const result = buildCustomTemplate('{{/block}}', projectWith(node))

    expect(result).toContain('>Hello <strong>world</strong></div>')
    expect(result).not.toContain('<div>Hello')
  })
})
