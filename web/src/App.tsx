import { useEffect } from 'react'
import { useSimulatorStore } from './stores/simulatorStore'
import SimulatorPage from './pages/SimulatorPage'

function Header() {
  return (
    <header className="bg-[var(--color-accent)] text-white px-6 py-3 flex items-center gap-6">
      <h1 className="text-lg font-bold">学マス アノマリー 最終ターン シミュレータ</h1>
      <span className="text-sm opacity-80">最適ムーブ × 上位パターン</span>
    </header>
  )
}

function Footer() {
  return (
    <footer className="text-center text-xs text-gray-400 py-4 mt-8 border-t border-gray-200">
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <a
          href="https://x.com/nakayoshi_2nd"
          className="hover:text-gray-600 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          𝕏 @nakayoshi_2nd
        </a>
        <span className="text-gray-300">|</span>
        <a
          href="https://github.com/tyuukiti/gakumasu-calc"
          className="hover:text-gray-600 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          姉妹プロジェクト: gakumasu-calc
        </a>
      </div>
    </footer>
  )
}

export default function App() {
  const { isLoading, error, initialize } = useSimulatorStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-gray-500">カードデータを読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-red-500">読み込みエラー: {error}</p>
      </div>
    )
  }

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <SimulatorPage />
      </main>
      <Footer />
    </>
  )
}
