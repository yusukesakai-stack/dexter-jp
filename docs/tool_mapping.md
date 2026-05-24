# ツール対応関係マッピング

> Session 5a (2026-05-24) 作成
> 既存 Dexter JP ツール (17本) と EDINET DB MCP ツール (15本) の対応関係を整理

---

## 前提: 既存ツールが使っている外部 API

| 既存ツール (公開名) | 内部サブツール | 呼び出す API エンドポイント | 外部サービス |
|---|---|---|---|
| get_financials (メタツール) | get_financial_statements | `GET /v1/companies/{code}/financials` | EDINET DB |
| | get_company_info | `GET /v1/companies/{code}` | EDINET DB |
| | get_key_ratios | `GET /v1/companies/{code}` | EDINET DB |
| | get_analysis | `GET /v1/companies/{code}/analysis` | EDINET DB |
| | get_earnings | `GET /v1/companies/{code}/earnings` | EDINET DB |
| read_filings (メタツール) | get_text_blocks | `GET /v1/companies/{code}/text-blocks` | EDINET DB |
| | get_shareholders | `GET /v1/companies/{code}/shareholders` | EDINET DB |
| company_screener | (内部LLMルーティング) | `GET /v1/screener` | EDINET DB |
| get_stock_price | — | `GET /v2/equities/bars/daily` | J-Quants V2 |
| (resolver, 内部) | — | `GET /v1/search` | EDINET DB |
| web_search | — | Exa / Perplexity / Tavily | 各社 API |
| x_search | — | X/Twitter API | X |
| web_fetch | — | fetch + Readability | 任意 URL |
| browser | — | Playwright (Chromium) | ローカル |
| read_file | — | fs.readFile | ローカル |
| write_file | — | fs.writeFile | ローカル |
| edit_file | — | fs (read+replace+write) | ローカル |
| skill | — | SKILL.md 読み込み + LLM | ローカル |
| heartbeat | — | .dexter/HEARTBEAT.md | ローカル |
| cron | — | croner (インプロセス) | ローカル |
| memory_search | — | better-sqlite3 + 埋め込みベクトル | ローカル |
| memory_get | — | better-sqlite3 | ローカル |
| memory_update | — | better-sqlite3 | ローカル |

**結論: 金融ツール 4 本 (get_financials, read_filings, company_screener, get_stock_price) はすべて EDINET DB API または J-Quants API を使用。残り 13 ツールは外部金融 API を使っていない。**

---

## EDINET DB MCP ツール一覧 (15 本)

MCP ガイドページ (https://edinetdb.jp/docs/mcp-guide) から取得。

| # | MCP ツール名 | 説明 | 対応 REST エンドポイント |
|---|---|---|---|
| 1 | get_company | 企業の基本情報・最新財務・財務健全性スコア | `GET /v1/companies/{code}` |
| 2 | get_financials | 最大6年分の財務時系列データ | `GET /v1/companies/{code}/financials` |
| 3 | get_analysis | AI分析（財務健全性スコア、業界ベンチマーク） | `GET /v1/companies/{code}/analysis` |
| 4 | search_companies | 企業名・証券コード・業種・スコア・タグで検索 | `GET /v1/search` |
| 5 | search_companies_batch | 複数企業の一括検索 | `GET /v1/search` (複数回) |
| 6 | get_ranking | 財務指標ランキング | `GET /v1/rankings/{metric}` |
| 7 | get_documentation | スコアリング手法・指標定義ドキュメント | (ドキュメント系) |
| 8 | get_text_blocks | 有報の全文テキスト（事業概況・リスク・MD&A等） | `GET /v1/companies/{code}/text-blocks` |
| 9 | get_earnings | TDNet 決算短信データ | `GET /v1/companies/{code}/earnings` |
| 10 | get_earnings_calendar | JPX 決算発表スケジュール | `GET /v1/calendar` |
| 11 | screen_companies | 134指標で複数条件スクリーニング | `GET /v1/screener` |
| 12 | get_watchlist | ウォッチリスト取得 | `GET /v1/watchlist` |
| 13 | add_to_watchlist | ウォッチリストに企業追加 | `POST /v1/watchlist` |
| 14 | remove_from_watchlist | ウォッチリストから企業削除 | `DELETE /v1/watchlist` |
| 15 | get_detailed_expenses | 販管費内訳（14カテゴリ×4グループ） | `GET /v1/companies/{code}/expenses` |

---

## A. 完全重複 (既存とMCPで同じ API エンドポイントを叩く)

| 既存ツール | 既存の内部サブツール | MCP ツール | 共通エンドポイント | 推奨アクション |
|---|---|---|---|---|
| get_financials | get_company_info | get_company | `/v1/companies/{code}` | MCP 側が直接的。既存はメタツール経由 |
| get_financials | get_key_ratios | get_company | `/v1/companies/{code}` | 同上 (同じエンドポイント) |
| get_financials | get_financial_statements | get_financials | `/v1/companies/{code}/financials` | 名前も機能も完全一致 |
| get_financials | get_analysis | get_analysis | `/v1/companies/{code}/analysis` | 名前も機能も完全一致 |
| get_financials | get_earnings | get_earnings | `/v1/companies/{code}/earnings` | 名前も機能も完全一致 |
| read_filings | get_text_blocks | get_text_blocks | `/v1/companies/{code}/text-blocks` | 名前も機能も完全一致 |
| read_filings | get_shareholders | — | `/v1/companies/{code}/shareholders` | MCP に shareholders なし |
| company_screener | — | screen_companies | `/v1/screener` | 機能一致。既存はLLM変換付き |
| (resolver) | — | search_companies | `/v1/search` | 既存は内部ユーティリティ、MCP はツール |

**重複数: 7 本のサブツール / 3 本のメタツールが、MCP の 6 本と重複**

---

## B. 部分重複 (一部機能が被る)

| 既存ツール | MCP ツール | 重複する部分 | 差異 |
|---|---|---|---|
| company_screener | screen_companies | 同じ `/v1/screener` | 既存: 自然言語→LLM→条件変換。MCP: 直接構造化パラメータ |
| (resolver 内部) | search_companies | 企業検索 | 既存: EDINET コード解決のみ。MCP: 検索結果そのものを返す |
| (resolver 内部) | search_companies_batch | 企業検索 (複数) | 既存に batch 機能なし |

---

## C. MCP のみ提供 (既存にない、追加価値あり)

| MCP ツール | 機能 | 追加優先度 | 理由 |
|---|---|---|---|
| get_earnings_calendar | JPX 決算発表スケジュール | 高 | イベントドリブン分析に必要。既存になし |
| get_ranking | 指標別ランキング (ROE, 配当利回り等) | 高 | 業界俯瞰・銘柄発見に有用。既存になし |
| get_detailed_expenses | 販管費内訳 (14カテゴリ×4グループ) | 中 | コスト構造分析に有用。既存になし |
| search_companies | 企業名・タグ検索 (ツールとして公開) | 中 | 既存は内部利用のみ。ツール化で直接検索可能に |
| search_companies_batch | 複数企業の一括検索 | 中 | 比較分析の効率化 |
| get_watchlist | ウォッチリスト取得 | 低 | ユーザー管理機能。エージェントの分析力には直結しない |
| add_to_watchlist | ウォッチリスト追加 | 低 | 同上 |
| remove_from_watchlist | ウォッチリスト削除 | 低 | 同上 |
| get_documentation | 指標定義・スコアリング手法 | 低 | エージェントが指標を説明する際に便利だが必須ではない |

---

## D. 既存のみ提供 (MCP にない)

| 既存ツール | 機能 | MCP にない理由 |
|---|---|---|
| get_stock_price | J-Quants 株価 OHLC | EDINET DB は株価データを持たない (別サービス) |
| read_filings (shareholders) | 大量保有報告書 | MCP に shareholders ツールが未実装 |
| web_search | Web 検索 | EDINET DB の守備範囲外 |
| x_search | X/Twitter 検索 | 同上 |
| web_fetch | URL 取得 | 同上 |
| browser | Playwright ブラウザ操作 | 同上 |
| read_file / write_file / edit_file | ファイル操作 | 同上 |
| skill | SKILL.md ワークフロー | 同上 |
| heartbeat | 定期チェック | 同上 |
| cron | スケジュールジョブ | 同上 |
| memory_* | メモリ (3ツール) | 同上 |

---

## E. REST API にはあるが MCP にもない機能 (将来の拡張候補)

REST API 仕様書 (https://edinetdb.jp/docs/api) から確認。MCP 15ツールでカバーされていない主要エンドポイント:

| REST エンドポイント | 機能 | 潜在的価値 |
|---|---|---|
| `/v1/companies/{code}/history` | 沿革タイムライン (1804-2025年) | 高: 当初の追加動機 |
| `/v1/companies/{code}/ratios` | 財務比率 (DuPont分解含む) | 高: 既存 key-ratios より詳細 |
| `/v1/companies/{code}/segments` | セグメント別業績 | 高: 事業構造分析 |
| `/v1/companies/{code}/directors` | 役員一覧 | 中: ガバナンス分析 |
| `/v1/companies/{code}/director-compensation` | 役員報酬内訳 | 中 |
| `/v1/companies/{code}/cross-shareholdings` | 政策保有株式 | 中: 株主構造分析 |
| `/v1/companies/{code}/subsidiaries` | 子会社一覧 | 中: グループ構造 |
| `/v1/companies/{code}/real-estate` | 不動産開示 | 中 |
| `/v1/companies/{code}/facilities` | 設備情報 | 低-中 |
| `/v1/companies/{code}/workforce` | HR・ダイバーシティ | 中: ESG分析 |
| `/v1/companies/{code}/governance-summary` | ガバナンス分析 | 中 |
| `/v1/companies/{code}/text-analysis` | 構造化テキスト (12要素) | 高: MD&A等の深堀り |
| `/v1/companies/{code}/compensation-text` | 報酬テキスト | 低-中 |
| `/v1/events` | 企業イベントフィード | 高: リアルタイム監視 |
| `/v1/queries/peer-comparison` | 同業比較 | 高: 競合分析 |
| `/v1/queries/financial-trajectory` | CAGR+トレンド+ボラティリティ | 高 |
| `/v1/queries/red-flags` | 財務レッドフラグ (BETA) | 高: リスク検知 |
| `/v1/queries/governance-score` | ガバナンススコア (BETA) | 中 |
| `/v1/shareholders/search` | 大株主名検索 | 中 |
| `/v1/shareholders/history` | 大株主推移 | 中: アクティビスト追跡 |
| `/v1/shareholders/activists` | アクティビスト一覧 | 中 |
| `/v1/ir/documents` | IR 資料 PDF 一覧 | 高: 統合報告書等 |
| `/v1/ir/sections/search` | IR セクション横断検索 | 高 |
| `/v1/companies/{code}/parent-company` | 親会社情報 | 低 |
| `/v1/companies/{code}/related-party-transactions` | 関連当事者取引 | 中 |
| `/v1/companies/{code}/main-customers` | 主要顧客 | 中 |

**補足: これらは MCP ツールとしては提供されていないが、REST API を直接叩けば利用可能。既存の `api.ts` インフラがそのまま使える。**

---

## 集計サマリ

| カテゴリ | 件数 |
|---|---|
| A. 完全重複 (既存サブツール ↔ MCP) | 6 組 |
| B. 部分重複 | 3 組 |
| C. MCP のみ (既存にない) | 9 本 (うち高優先度 2, 中 3, 低 4) |
| D. 既存のみ (MCP にない) | 13 本 |
| E. REST API のみ (MCP にもない) | 25+ エンドポイント |
