# 学マス アノマリー 最終ターン シミュレータ

[![Deploy](https://github.com/tyuukiti/gakumasu-anomaly-sim/actions/workflows/deploy.yml/badge.svg)](https://github.com/tyuukiti/gakumasu-anomaly-sim/actions/workflows/deploy.yml)
[![CI](https://github.com/tyuukiti/gakumasu-anomaly-sim/actions/workflows/ci.yml/badge.svg)](https://github.com/tyuukiti/gakumasu-anomaly-sim/actions/workflows/ci.yml)

🌐 **公開URL**: https://tyuukiti.github.io/gakumasu-anomaly-sim/

学園アイドルマスター（学マス）の**アノマリーモード最終ターン**で取りうるプレイ順を全探索し、ドロー運による分岐も含めた**期待スコア上位 2 パターン＋最安定 1 パターン**を提示する Web ツールです。

> 「センブリで何を引いたかでムーブが分からん」「巻き返しと温存→強気の熱意ループ、もっと最適手順あるかも」を毎回検証する手間をゼロに。

![placeholder: スクリーンショット](./docs/screenshot.png)

## 特徴

- 🎴 **手札・デッキ・捨て札・保持ドリンクを入力**してワンクリック探索
- 🎲 **ドロー運込みの全探索**: 期待スコア計算、発生確率表示
- 🔀 **失敗時の代替分岐**: 各ドローステップに「もし違うカードを引いた場合」の最適続きを表示
- 🛠 **Wiki 準拠の熱意モデル**:
  - 熱意 = `ceil((熱意追加 + N) × (1 + 熱意増加%/100))` （温存解除時、N=温存1段階で5/温存2段階で8）
  - 強気倍率（1段階+100% / 2段階+150%）、パラメータ上昇量増加% などを正しく合算
- 🧪 **カードカスタマイズ対応**: 巻き返しの「除外解除」「全力値消費なし」、エンターテイナーの「成長スタック」事前適用 など
- 📋 **状態のコピー / 貼付**: シミュレータの入力一式を JSON でクリップボード共有可能

## クイックスタート

### 1. リポジトリ取得 & 依存インストール

```bash
git clone https://github.com/tyuukiti/gakumasu-anomaly-sim.git
cd gakumasu-anomaly-sim/web
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開けば起動。

### 2. （任意）カードデータの再取得

Wiki のカードや カスタム情報を最新化したいとき:

```powershell
python scripts/sync_anomaly_wiki.py
```

`Data/AnomalyCards/{free,anomaly,trouble,pidol}_cards.yaml` と `customizations.yaml` が再生成されます。

## 使い方の流れ

1. **手札・デッキ・捨て札・保持ドリンク** を検索→クリックで追加
2. 必要なら **⚙ アイコン** からカード固有のカスタマイズ（除外解除・成長スタック等）を設定
3. **ステータス**（熱意追加 / 熱意増加% / パラメータ上昇量増加% / スタンス / 残り使用数）を入力
4. 「🔍 最適ムーブを探索」を押すと **3 パターン**が表示される:
   - `#1` / `#2`: 期待スコア上位 2
   - `🛡 安定`: 発生確率が最も高い手堅いパターン
5. 各パターンの**ドローステップ**で「⚠ もし違うカードを引いた場合」を開けば失敗時の最適続きを確認可能

## プロジェクト構成

```
gakumasu-anomaly-sim/
├── Data/AnomalyCards/        # スクレイプ済みカード/ドリンク/カスタムYAML
│   ├── free_cards.yaml       # フリーカード 12
│   ├── anomaly_cards.yaml    # アノマリーカード 69
│   ├── trouble_cards.yaml    # トラブルカード 1
│   ├── pidol_cards.yaml      # P-Idol固有 + SP固有 186
│   ├── drinks.yaml           # 保持Pドリンク 6
│   └── customizations.yaml   # カード毎のカスタマイズ選択肢
├── scripts/                  # Python スクレイパー
│   ├── sync_anomaly_wiki.py  # エントリ
│   └── anomaly_sync/         # network / parser / effect_parser / ...
└── web/                      # シミュレータ本体 (React + Vite)
    ├── src/
    │   ├── pages/SimulatorPage.tsx
    │   ├── components/simulator/
    │   ├── services/         # 探索エンジン / 効果実行
    │   ├── stores/           # Zustand
    │   └── types/
    └── public/data/          # ビルド時 Data/ から自動コピー
```

## 重要な仕様（実装メモ）

### 熱意の三系統（同名で性質が異なる3つ）

| Wiki 表記 | 内部名 | 期間 | 役割 |
|---|---|---|---|
| 熱意 | `passion` | そのターンのみ | アタックごとに param へ加算（非消費） |
| 熱意追加 | `passionBuff` | 永続 | 温存解除時の基礎値に加算 |
| 熱意増加 | `passionGainBonusPct` | 永続 | 温存解除時の % 倍率 |

公式（温存解除時のみ発火）:
```
gain = ceil((熱意追加 + N) × (1 + 熱意増加%/100))
N = 温存1段階=5 / 温存2段階=8 / のんびり=10
熱意 += gain
```

### 強気倍率（param 効果獲得時に乗算）
- 強気1段階: +100%（×2.0）
- 強気2段階: +150%（×2.5）
- `paramBoostPct`（パラメータ上昇量増加%）と加算で重畳

### カード使用後の挙動
- 備考に「レッスン中1回」を含む → 除外（デッキ復帰しない）
- それ以外 → 捨て札へ（デッキ枯渇時に再シャッフル）
- カスタムで除外解除（noExile）可能

### 成長効果
- カード備考の `[成長]` 行を解析。`max_count` と per-fire bonus（`paramRepeatBonus` / `hpCostReduction` / `paramValueIncrease`）を抽出
- UI のカスタムから「成長スタック数（0〜max）」として事前適用可能

詳細は [`CLAUDE.md`](./CLAUDE.md) を参照。

## 技術スタック

| 領域 | 採用 |
|---|---|
| Web フロント | React 19 / TypeScript / Vite 8 / Zustand 5 |
| データ形式 | YAML (js-yaml) |
| データ取得 | Python 3.10+ / BeautifulSoup4 / PyYAML |
| Wiki エンコーディング | EUC-JP（seesaawiki 仕様） |

## データ出典

カード効果・カスタム情報・Pドリンク効果は [学マス Wiki](https://seesaawiki.jp/gakumasu/) のスキルカード一覧 / Pドリンク一覧 / 効果＆強化ページから取得。
ゲームメカニクス（数値・効果名）は同 Wiki の解説を典拠としています。

カード画像・テキストの著作権は株式会社バンダイナムコエンターテインメントに帰属します。本ツールは個人によるファン向け非公式の計算補助ツールです。

## 関連プロジェクト

- [gakumasu-calc](https://github.com/tyuukiti/gakumasu-calc): 学マス サポートカード編成最適化ツール（姉妹プロジェクト）

## デプロイ (GitHub Pages)

`main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド & GitHub Pages 公開します。

### 初回セットアップ (一度だけ)

GitHub の `Settings → Pages → Source` を **「GitHub Actions」** に設定してください。
これがされていないと workflow の `Setup Pages` ステップが「Resource not accessible by integration」で失敗します。

一度設定すれば、以降の `main` への push は自動でビルド・デプロイされます。

`base` パスは `vite.config.ts` 内で `GITHUB_REPOSITORY` 環境変数から自動解決するので、リポジトリ名を変えても workflow 修正は不要です。

## ライセンス

[MIT License](./LICENSE)
