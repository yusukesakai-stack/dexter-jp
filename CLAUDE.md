# CLAUDE.md — Dexter JP 開発ルール

> このファイルは AI アシスタント (Claude Code 等) がコードベースを扱う際の行動規範。
> 人間の開発者にとっても「このプロジェクトのお作法」の一次ソース。

---

## プロジェクト概要

日本の上場企業 (~3,800社) 向け自律型AIリサーチエージェント。ターミナルで動く。
ユーザーの自然言語クエリに対し、エージェントが自律的に計画→ツール選択→実行→検証のループを回し、構造化レポートを出力する。

- フォーク元: [virattt/dexter](https://github.com/virattt/dexter) (米国株版)
- 分岐点: 2026-03-26 コミット `f7dda2b` で EDINET DB + J-Quants に全面差替え
- 対をなすプロジェクト: yuho-generator (書く側。本プロジェクトは「読む/分析する」側)

---

## 絶対ルール

1. **推測禁止・実データのみ** — 確認できない情報は「分からない」と言う。データを集めてから見解を持つ。この順序が絶対
2. **既存ファイル編集前に diff 提示 → 承認必須** — 無断編集禁止
3. **git コミット・プッシュ禁止** — ユーザーが手動で実行する
4. **進捗は `docs/progress_log.md` に追記** — セッション単位で記録
5. **ドキュメント・README を勝手に作成しない** — 明示指示がある場合のみ

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| ランタイム | Bun (primary。npm/node ではなく bun を使う) |
| 言語 | TypeScript (ESM, strict mode) |
| CLI UI | Ink (React for CLI) |
| エージェント | LangChain (@langchain/core) |
| LLM | マルチプロバイダ (Anthropic / OpenAI / Google / xAI / Ollama) |
| 金融データ | EDINET DB API (edinetdb.jp/v1) |
| 株価 | J-Quants V2 API (api.jquants.com/v2) |
| メモリ | better-sqlite3 + 埋め込みベクトル |
| ブラウザ | Playwright (Chromium) |
| テスト | vitest (型定義) + bun test (実行) |
| バリデーション | Zod |

---

## コマンド

```bash
bun install           # 依存インストール (postinstall で Playwright Chromium も入る)
bun run start         # 通常起動
bun run dev           # ウォッチモード
bun run typecheck     # tsc --noEmit (エラーゼロであること)
bun test              # テスト実行 (36 tests, 6 files)
```

---

## ディレクトリ構造

```
src/
├── index.tsx              # エントリポイント (dotenv → runCli)
├── cli.ts                 # Ink/React CLI メインコンポーネント
├── agent/
│   ├── agent.ts           # ★ エージェントループ (心臓部)
│   ├── prompts.ts         # システムプロンプト構築
│   ├── scratchpad.ts      # コンテキスト管理
│   └── tool-executor.ts   # ツール実行
├── model/
│   └── llm.ts             # マルチプロバイダ LLM 抽象化
├── tools/
│   ├── registry.ts        # ツール登録 (環境変数で条件付き)
│   ├── finance/           # 金融ツール群
│   ├── search/            # Web検索・X検索
│   ├── fetch/             # URL取得 (Readability)
│   ├── browser/           # Playwright 制御
│   ├── filesystem/        # ファイル操作
│   ├── memory/            # メモリ (セマンティック検索)
│   ├── skill.ts           # SKILL.md ワークフロー
│   ├── heartbeat/         # 定期チェックリスト
│   └── cron/              # スケジュールジョブ
├── skills/                # SKILL.md ファイル群 (DCF, X-research)
├── gateway/               # WhatsApp 配信チャネル
└── evals/                 # LangSmith 評価
```

---

## アーキテクチャの要点

### メタツールパターン

`get_financials` と `company_screener` は内部にもう1つ LLM を持つ「メタツール」。
外側のエージェント LLM がこれらを呼ぶと、内側の LLM がさらにサブツールを選択する二重構造。

```
ユーザー → エージェントLLM → get_financials (メタツール)
                                  → 内部LLM → [financial_statements, key_ratios, ...] 並列実行
```

### ツール登録の条件分岐

`registry.ts` が環境変数に基づいてツールを条件付き登録する:

- `JQUANTS_API_KEY` → get_stock_price 有効
- `EXASEARCH_API_KEY` / `PERPLEXITY_API_KEY` / `TAVILY_API_KEY` → web_search 有効
- `X_BEARER_TOKEN` → x_search 有効

### ティッカー解決

会社名 ("トヨタ") → EDINET コード (E02144) → 証券コード (7203) の変換は `resolver.ts` が担当。
すべての金融ツールで共有。

---

## コーディング規約

- **TypeScript strict、`any` 禁止** — 型で守る
- **ファイルは簡潔に** — 重複よりヘルパー抽出
- **ログは追加しない** (明示指示がない限り)
- **JSX は Ink コンポーネントのみ** (ブラウザ React ではない)
- **ツール定義は Zod スキーマ + DynamicStructuredTool** — LangChain のパターンに従う
- **テストは `*.test.ts` でコロケーション** — vitest の describe/expect/test を import

---

## 環境変数

### 必須 (最小起動セット)

| 変数 | 用途 |
|------|------|
| `EDINETDB_API_KEY` | 金融データ全般 |
| LLM キー (いずれか1つ) | エージェントの思考エンジン |

### 現在の設定

- プロバイダ: `anthropic` / モデル: `claude-sonnet-4-6` (`.dexter/settings.json`)
- `JQUANTS_API_KEY`: 設定済み (get_stock_price 有効)
- Web 検索キー: 未設定 (web_search 無効)
- X API キー: 未設定 (x_search 無効)

---

## テスト

- フレームワーク: `bun test` (Bun ネイティブランナー)
- 型定義: `vitest` (devDependencies)
- 現在: 36 tests / 6 files / 0 fail
- テスト対象: gateway 系 (access-control, utils, sessions, routing, reconnect) + utils/cache
- 金融ツールのテストは未作成 (外部 API 依存のためモック戦略が必要)

---

## 設計思想 (SOUL.md 要約)

- **データ先行**: データを集めてから見解を持つ。この順序が絶対
- **一次ソース主義**: 有価証券報告書 (EDINET) が真実の源泉
- **Buffett/Munger 哲学**: 安全余裕、逆転思考、能力の輪を超えない
- **簡潔さ**: パディングなし、自分の思考過程を実況しない

---

## 既知の制約・注意点

- J-Quants 無料枠はデータに約3ヶ月の遅延がある (有料プランで解消可能)
- `browser` ツールは Playwright の `_snapshotForAI` (内部API) を使用 — 将来の Playwright アップデートで破壊される可能性
- `cron` ジョブの結果配信は WhatsApp を前提とした設計 (gateway/ ディレクトリ)
- メモリのセマンティック検索は埋め込みモデル (OpenAI → Gemini → Ollama 優先順) が必要
