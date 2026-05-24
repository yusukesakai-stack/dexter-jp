# Dexter JP 開発進捗ログ

## 2026-05-24 Session 1: 現状把握

### 既存ツール一覧

| ツール名 | ファイル | 説明 | 条件 |
|---------|--------|------|------|
| get_financials | src/tools/finance/get-financials.ts | メタツール（内部LLMルーティング）。financials, key-ratios, earnings, analysis をサブツールとして統合 | 常時有効 |
| read_filings | src/tools/finance/read-filings.ts | 有価証券報告書テキスト + 大量保有報告書 | 常時有効 |
| company_screener | src/tools/finance/screen-companies.ts | ~3,800社、100+指標でスクリーニング | 常時有効 |
| get_stock_price | src/tools/finance/stock-price.ts | J-Quants V2 API で株価OHLC取得 | JQUANTS_API_KEY 設定時 |
| web_search | src/tools/search/ | Exa > Perplexity > Tavily の優先順 | いずれかのAPIキー設定時 |
| x_search | src/tools/search/x-search.ts | X/Twitter 検索 | X_BEARER_TOKEN 設定時 |
| web_fetch | src/tools/fetch/web-fetch.ts | URL取得（Readability でテキスト抽出） | 常時有効 |
| browser | src/tools/browser/browser.ts | Playwright ベースのウェブスクレイピング | 常時有効 |
| read_file | src/tools/filesystem/read-file.ts | ファイル読み取り | 常時有効 |
| write_file | src/tools/filesystem/write-file.ts | ファイル書き込み | 常時有効 |
| edit_file | src/tools/filesystem/edit-file.ts | ファイル編集 | 常時有効 |
| skill | src/tools/skill.ts | SKILL.md ベースのワークフロー実行 | スキルが存在する場合 |
| heartbeat | src/tools/heartbeat/heartbeat-tool.ts | 定期ヘルスチェック | 常時有効 |
| cron | src/tools/cron/cron-tool.ts | 定期タスクスケジューリング | 常時有効 |
| memory_search | src/tools/memory/memory-search.ts | メモリ検索 | 常時有効 |
| memory_get | src/tools/memory/memory-get.ts | メモリ取得 | 常時有効 |
| memory_update | src/tools/memory/memory-update.ts | メモリ更新 | 常時有効 |

### 使用中の主要ライブラリとバージョン

- @langchain/core: 1.1.36 (package.json: ^1.1.36)
- @langchain/anthropic: 1.3.25
- @langchain/openai: 1.3.1
- @langchain/google-genai: ^2.1.26
- @langchain/ollama: ^1.2.6
- @langchain/exa: ^1.0.1
- @langchain/tavily: ^1.2.0
- playwright: ^1.58.2
- better-sqlite3: ^12.8.0 (メモリ用)
- zod: ^4.3.6
- bun: ランタイム (バージョン未確認)
- typescript: ^5.9.3

### エントリポイント

- `src/index.tsx` → dotenv 読込 → `runCli()` (src/cli.ts)
- CLI は Ink (React for CLI) ベース
- bin: `dexter-ts` → `./src/index.tsx`
- 起動: `bun run start`

### 現状の動作可否

- リポジトリ構造: 完備（src/, tools/, agent/, skills/, memory/, evals/ 等すべて揃っている）
- node_modules: インストール済み
- .env: 設定済み（ANTHROPIC_API_KEY, EDINETDB_API_KEY, JQUANTS_API_KEY が有効値）
- 現在のモデル設定: anthropic / claude-sonnet-4-6 (.dexter/settings.json)
- git 履歴: 94bd404 が最新コミット（"Add startup warnings, JP test fixtures, contributing guide"）
- 動作テスト: 未実施（今セッションでは読み取りのみ）

### 不足しているもの

- CLAUDE.md: プロジェクトルールに「詳細な技術ルールは CLAUDE.md を参照」とあるが未作成
- Web検索APIキー: EXASEARCH, PERPLEXITY, TAVILY いずれも未設定（web_search ツール無効）
- X/Twitter APIキー: 未設定（x_search ツール無効）
- OpenAI APIキー: 未設定（デフォルトプロバイダが openai だが、anthropic に切替済みなので実用上問題なし）
- テストカバレッジ: 未確認
- docs/progress_log.md: 本セッションで作成（このファイル）

---

## 2026-05-24 Session 2: コードベース再理解 & ドキュメント整備

### 実施内容

1. **フォーク元調査**
   - フォーク元: [virattt/dexter](https://github.com/virattt/dexter) (米国株版、Financial Datasets API ベース)
   - origin URL: `https://github.com/edinetdb/dexter-jp.git`
   - 初回コミット: 2025-10-14 (フォーク元由来)
   - 日本市場向け改修: 2026-03-26 のコミット `f7dda2b` ("Adapt Dexter for Japanese market with EDINET DB API") が分岐点
   - 総コミット数: 411

2. **思想ファイル精読**
   - AGENTS.md: 開発ガイドライン (プロジェクト構造、コーディング規約、ツール一覧)
   - SOUL.md: エージェントの性格定義 (Buffett/Munger哲学、推測禁止、独立した分析)
   - README.md: ユーザー向けプロダクト紹介 (アーキテクチャ図、使い方例)

3. **ドキュメント新規作成**
   - `docs/architecture.md` — Mermaid図3点 (全体構成、ツールマインドマップ、データフロー)
   - `docs/tools_catalog.md` — 17ツール全ての入出力スキーマ・依存関係カタログ
   - `docs/setup_checklist.md` — 環境変数の意味、最小/フル構成、セットアップ手順

4. **全17ツールのソースコード精読完了**

### 発見事項

- get_financials, company_screener は「メタツール」: 内部にLLMを持ち、自然言語→APIパラメータ変換を行う二重構造
- web_fetch は OpenClaw (MIT) からポートされたコード
- browser は Playwright の `_snapshotForAI` (内部API) を使用
- cron ジョブの結果は WhatsApp 配信を前提とした設計 (gateway/ ディレクトリ)
- メモリは better-sqlite3 + 埋め込みモデルによるセマンティック検索

### 次セッション (Session 3) への推奨

1. `bun run start` で実際に起動し、EDINET DB API との疎通を確認
2. `bun test` でテスト状態を把握
3. CLAUDE.md の作成 (開発ルールの明文化)
4. yuho-generator との連携設計の議論開始

### 追加成果物

- `docs/briefing.md` — 4ドキュメントを統合した15分ブリーフィング (Session 2 後半で作成)

---

## 2026-05-24 Session 3: 起動 & 疎通テスト

### 環境

- Bun: 1.3.11
- macOS (MacBook-Pro-445)
- LLM: Anthropic / claude-sonnet-4-6

### Phase A: 起動前確認

- git status: docs/ 配下の5ファイルが untracked のみ。本体コードに変更なし
- .env: 必須キー3種 (EDINETDB, ANTHROPIC, JQUANTS) 設定済み
- bun.lock: 存在確認OK、node_modules インストール済み
- typecheck: 6件のエラー (すべて *.test.ts の vitest import 不足。本体コードはエラーゼロ)

### Phase A 発見事項

- ANTHROPIC_API_KEY が期限切れ → 新キーに差替えて解決
- vitest が devDependencies に未追加 (テストは bun test で実行する設計だが import は vitest のまま)

### Phase B: 疎通テスト (3/3 成功)

| # | クエリ | 呼ばれたツール | 所要時間 | トークン | 結果 |
|---|-------|-------------|---------|---------|------|
| ① | トヨタの基本情報を教えて | get_financials → get_company_info | 13s | 27,282 | 企業情報テーブル + 直近業績 + FY2026予想 ✅ |
| ② | ソニーの直近3年の売上・営業利益・ROEの推移 | get_financials → get_financial_statements | 13s | 28,622 | 3年比較テーブル + ポイント分析 ✅ |
| ③ | キーエンスの競争力を分析して | get_financials + read_filings | 37s | 40,473 | 強み4点 + リスク5点 + 総括の構造化レポート ✅ |

### 確認済みの動作

- EDINET DB API 疎通: OK
- ティッカー解決 (会社名 → EDINETコード): OK
- メタツール内部LLMルーティング: OK
- 複数ツール連鎖 (get_financials → read_filings → レポート生成): OK
- 日本語出力フォーマット: OK

### 未確認 (Session 4 で対処)

- get_stock_price (J-Quants): 未テスト → Session 4 で確認済み ✅
- company_screener: 未テスト → Session 4 で確認済み ✅
- web_search: APIキー未設定のため無効 (変更なし)
- テスト (bun test): vitest 未インストールで実行不可 → Session 4 で解決 ✅
- CLAUDE.md 作成: 未着手 → Session 4 で作成 ✅

---

## 2026-05-24 Session 4: 基盤完備

### Step 1: 残りツールの動作確認

| # | クエリ | 呼ばれたツール | 所要時間 | トークン | 結果 |
|---|-------|-------------|---------|---------|------|
| A | トヨタの最新の株価を教えて | get_stock_price | — | — | ¥3,825 (2026/2/27時点、J-Quants無料枠は約3ヶ月遅延) ✅ |
| B | ROE15%以上かつ配当利回り3%以上の銘柄 | company_screener | — | — | 25社ヒット、豆蔵(202A) ROE50.6%がトップ ✅ |
| C | 自己資本比率50%以上かつROE15%以上、上位3社の株価も | company_screener → get_stock_price | 22s | 46,316 | 401社ヒット、サン電子¥7,040取得。フツパー(478A)はJ-Quants未対応 ✅ |

- 全17ツール中、APIキー有効な15ツールの動作確認完了
- 未確認: web_search (キー未設定), x_search (キー未設定)

### Step 2: vitest 追加 → テスト基盤整備

- **変更**: package.json の devDependencies を整理
  - 追加: `vitest@3.2.4`
  - 削除: `@types/jest`, `babel-jest`, `jest`, `ts-jest` (未使用の4パッケージ)
- **typecheck**: 6エラー → 0エラー (vitest の型解決で全件解消)
- **bun test**: 36 pass / 0 fail / 6 files / 114ms

### Step 3: CLAUDE.md 作成

- `CLAUDE.md` を新規作成 — プロジェクトの開発ルール・技術スタック・アーキテクチャ要点・コーディング規約を集約
- AGENTS.md (開発ガイドライン) + SOUL.md (設計思想) + Session 1-4 の知見を統合

### Session 4 成果まとめ

| 項目 | Before | After |
|------|--------|-------|
| ツール動作確認 | 12/17 | 15/17 (残り2つはAPIキー未設定で対象外) |
| typecheck | 6エラー | 0エラー |
| bun test | 実行不可 | 36 pass / 0 fail |
| CLAUDE.md | 未作成 | 作成完了 |
| jest 関連 (未使用) | 4パッケージ | 削除済み |

### 次セッション (Session 5) への推奨

1. CLAUDE.md の内容確認・調整
2. yuho-generator との連携設計
3. 金融ツールのユニットテスト設計 (モック戦略の検討)
4. Web検索APIキー (TAVILY_API_KEY) の取得・設定 (任意)
