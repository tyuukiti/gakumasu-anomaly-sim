import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Data/AnomalyCards/*.yaml を web/public/data/ にコピーする内製プラグイン。
 * dev / build の双方で起動時に1回コピー。
 */
function copyAnomalyData(): Plugin {
  return {
    name: 'copy-anomaly-data',
    buildStart() {
      const srcDir = resolve(__dirname, '../Data/AnomalyCards')
      const dstDir = resolve(__dirname, 'public/data')
      if (!existsSync(srcDir)) return
      mkdirSync(dstDir, { recursive: true })
      for (const file of readdirSync(srcDir)) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          copyFileSync(resolve(srcDir, file), resolve(dstDir, file))
        }
      }
    },
  }
}

/**
 * GitHub Actions 環境では GITHUB_REPOSITORY="owner/repo" から自動でリポジトリ名を取得し
 * /<repo>/ を base に設定 (GitHub Pages のサブパス対応)。
 * ローカル開発時は './' を使うので任意パスで動く。
 */
function resolveBase(): string {
  // 明示指定が最優先
  if (process.env.BASE_PATH) return process.env.BASE_PATH
  // GitHub Actions では GITHUB_REPOSITORY が "owner/repo" 形式で提供される
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
    if (repo) return `/${repo}/`
  }
  return './'
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyAnomalyData()],
  base: resolveBase(),
})
