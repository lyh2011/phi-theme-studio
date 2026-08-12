import { FileType2, ImagePlus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { FONT_ACCEPT, IMAGE_ACCEPT, formatBytes } from '../lib/assets'
import { RATING_KEYS, type PackageAsset, type RatingKey, type ThemeResources } from '../types/theme'

const demoRatingUrl = (rating: RatingKey) => `${import.meta.env.BASE_URL}demo/rating/${rating}.png`

export type UploadTarget = { kind: 'background' } | { kind: 'font' } | { kind: 'icon'; rating: RatingKey }

interface AssetFormProps {
  resources: ThemeResources
  assets: PackageAsset[]
  onUpload: (target: UploadTarget, file: File) => void
  onRemove: (target: UploadTarget) => void
}

function assetFor(path: string | undefined, assets: PackageAsset[]) {
  return path ? assets.find((asset) => asset.path === path) : undefined
}

export function AssetForm({ resources, assets, onUpload, onRemove }: AssetFormProps) {
  const background = assetFor(resources.background, assets)
  const font = assetFor(resources.font, assets)

  return (
    <div className="inspector-form asset-form">
      <section className="form-section">
        <h2>主题资源</h2>
        <div className="asset-row">
          <div className="asset-preview wide">
            {background ? <img src={background.previewUrl} alt="背景预览" /> : <ImagePlus size={22} aria-hidden="true" />}
          </div>
          <div className="asset-meta">
            <strong>背景</strong>
            <span>{background ? `${background.path} · ${formatBytes(background.bytes.byteLength)}` : '使用插件背景'}</span>
          </div>
          <label className="icon-button" title="上传背景">
            <Upload size={16} aria-hidden="true" />
            <input type="file" accept={IMAGE_ACCEPT} onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload({ kind: 'background' }, file)
              event.target.value = ''
            }} />
          </label>
          <button className="icon-button" type="button" title="恢复插件背景" disabled={!background} onClick={() => onRemove({ kind: 'background' })}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="asset-row">
          <div className="asset-preview"><FileType2 size={20} aria-hidden="true" /></div>
          <div className="asset-meta">
            <strong>字体</strong>
            <span>{font ? `${font.path} · ${formatBytes(font.bytes.byteLength)}` : '使用插件字体'}</span>
          </div>
          <label className="icon-button" title="上传字体">
            <Upload size={16} aria-hidden="true" />
            <input type="file" accept={FONT_ACCEPT} onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload({ kind: 'font' }, file)
              event.target.value = ''
            }} />
          </label>
          <button className="icon-button" type="button" title="恢复插件字体" disabled={!font} onClick={() => onRemove({ kind: 'font' })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="form-section">
        <h2>评级图标</h2>
        <div className="rating-assets">
          {RATING_KEYS.map((rating) => {
            const asset = assetFor(resources.icons[rating], assets)
            return (
              <div className="rating-asset" key={rating}>
                <label title={`上传 ${rating} 图标`}>
                  <span>{rating}</span>
                  <img src={asset?.previewUrl || demoRatingUrl(rating)} alt={`${rating} 图标`} />
                  <input type="file" accept={IMAGE_ACCEPT} onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onUpload({ kind: 'icon', rating }, file)
                    event.target.value = ''
                  }} />
                </label>
                {asset && (
                  <button type="button" title={`移除 ${rating} 自定义图标`} onClick={() => onRemove({ kind: 'icon', rating })}>
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
