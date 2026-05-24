# Dexter JP ツールカタログ

全17ツールの詳細仕様。ソースコードから直接読み取った情報のみ記載。

---

## 1. get_financials (メタツール)

- **ファイル**: `src/tools/finance/get-financials.ts`
- **役割**: 自然言語クエリを受け取り、内部LLMが適切な金融サブツールに自動ルーティングする統合ツール
- **入力スキーマ**:
  ```
  { query: string }  // 例: "トヨタの直近3年の売上推移"
  ```
- **内部サブツール**:
  - `get_financial_statements` — 財務時系列データ (最大6年分、PL/BS/CF)
  - `get_company_info` — 企業基本情報 (業種、会計基準、証券コード)
  - `get_key_ratios` — 最新の主要指標スナップショット (ROE, PER, 配当利回り等)
  - `get_analysis` — AI分析 (ヘルススコア、サマリー)
  - `get_earnings` — 決算短信 (TDNet)
- **出力例**: サブツール結果をキー `{tool_name}_{ticker}` で統合したJSON + sourceUrls
- **外部依存**: EDINET DB API (`edinetdb.jp/v1`)
- **APIキー**: `EDINETDB_API_KEY` (必須) + LLMキー (ルーティング用)
- **連携**: 内部で5つのサブツールを並列実行。ティッカー解決は `resolver.ts` 経由

---

## 2. read_filings (メタツール)

- **ファイル**: `src/tools/finance/read-filings.ts`
- **役割**: 有価証券報告書のテキストまたは大量保有報告書を取得
- **入力スキーマ**:
  ```
  {
    ticker: string,                              // "7203" or "任天堂" or "E02367"
    type?: "text-blocks" | "shareholders"         // デフォルト: text-blocks
  }
  ```
- **出力**: `text-blocks` → 事業の状況、リスク、MD&A、経営方針のテキスト。`shareholders` → 5%超の大量保有者一覧
- **外部依存**: EDINET DB API
- **APIキー**: `EDINETDB_API_KEY` (必須)
- **連携**: 内部で `text-blocks.ts`, `shareholders.ts` に委譲。ティッカー解決は `resolver.ts`

---

## 3. company_screener (メタツール)

- **ファイル**: `src/tools/finance/screen-companies.ts`
- **役割**: 自然言語で記述されたスクリーニング条件をLLMが構造化し、~3,800社をフィルタリング
- **入力スキーマ**:
  ```
  { query: string }  // 例: "ROE15%以上、配当利回り3%以上の銘柄"
  ```
- **LLM変換後の内部スキーマ**:
  ```
  {
    conditions: [{ metric: string, operator: "gte"|"lte"|"gt"|"lt"|"eq", value: number }],
    industry?: string,     // "情報・通信業" 等
    limit?: number,        // デフォルト25
    sort_by?: string
  }
  ```
- **対応指標**: ROE, ROIC, ROA, PER, PBR, EPS, BPS, 配当利回り, 売上成長率, CAGR(3年), ヘルススコア, DE比率, FCF, EBITDA 等 25+
- **外部依存**: EDINET DB API (`GET /screener`)
- **APIキー**: `EDINETDB_API_KEY` (必須) + LLMキー (条件変換用)
- **連携**: なし (単独実行)

---

## 4. get_stock_price

- **ファイル**: `src/tools/finance/stock-price.ts`
- **役割**: J-Quants V2 API から日次株価 (OHLC + 出来高) を取得
- **入力スキーマ**:
  ```
  {
    ticker: string,    // "7203" or "トヨタ"
    from?: string,     // "YYYY-MM-DD" (省略で最新)
    to?: string        // "YYYY-MM-DD"
  }
  ```
- **出力**: 単日 → `{code, date, open, high, low, close, volume}` / 期間 → 配列
- **外部依存**: J-Quants V2 API (`api.jquants.com/v2`)
- **APIキー**: `JQUANTS_API_KEY` (オプション。未設定時はツール自体が非表示)
- **連携**: ティッカー解決で EDINET DB API も使用 (会社名 → 証券コード変換時)
- **備考**: V2 API は x-api-key ヘッダー認証、トークンリフレッシュ不要

---

## 5. web_search

- **ファイル**: `src/tools/search/exa.ts` / `perplexity.ts` / `tavily.ts`
- **役割**: Web検索。設定されたAPIキーに応じて実装が切り替わる (Exa → Perplexity → Tavily)
- **入力スキーマ**:
  ```
  { query: string }
  ```
- **出力**: 検索結果 (タイトル, URL, スニペット) 最大5件
- **外部依存**: Exa API / Perplexity API (sonarモデル) / Tavily API
- **APIキー**: `EXASEARCH_API_KEY` or `PERPLEXITY_API_KEY` or `TAVILY_API_KEY` (いずれか1つ。未設定時はツール非表示)
- **連携**: なし

---

## 6. x_search

- **ファイル**: `src/tools/search/x-search.ts`
- **役割**: X/Twitter API v2 でツイート検索、ユーザープロフィール取得、スレッド取得
- **入力スキーマ**:
  ```
  {
    command: "search" | "profile" | "thread",
    query?: string,           // 検索クエリ or ツイートID
    username?: string,        // profileコマンド用
    sort?: "likes" | "impressions" | "retweets" | "recent",
    since?: string,           // "1h", "3d", ISO 8601
    min_likes?: number,
    limit?: number,           // デフォルト15
    pages?: number            // 1-5、デフォルト1
  }
  ```
- **出力**: ツイート配列 (テキスト, メトリクス, 著者情報, URL)
- **外部依存**: X API v2 (`api.x.com/2`)
- **APIキー**: `X_BEARER_TOKEN` (オプション。未設定時はツール非表示)
- **連携**: なし
- **備考**: 直近7日間のみ検索可能。リツイートは自動除外

---

## 7. web_fetch

- **ファイル**: `src/tools/fetch/web-fetch.ts`
- **役割**: URLからページコンテンツを取得し、Readabilityでテキスト抽出
- **入力スキーマ**:
  ```
  {
    url: string,
    extractMode?: "markdown" | "text",   // デフォルト: markdown
    maxChars?: number                     // デフォルト: 20,000
  }
  ```
- **出力**: `{url, finalUrl, title, text, extractMode, extractor, truncated, tookMs}`
- **外部依存**: なし (標準 fetch + @mozilla/readability)
- **APIキー**: 不要
- **連携**: なし
- **備考**: 15分間キャッシュ。リダイレクト最大3回。OpenClaw の同名ツールからポート

---

## 8. browser

- **ファイル**: `src/tools/browser/browser.ts`
- **役割**: Playwright で Chromium を制御し、JS描画されたページの操作・テキスト抽出を行う
- **入力スキーマ**:
  ```
  {
    action: "navigate" | "open" | "snapshot" | "act" | "read" | "close",
    url?: string,
    maxChars?: number,
    request?: {
      kind: "click" | "type" | "press" | "hover" | "scroll" | "wait",
      ref?: string,        // スナップショットの要素参照 (e.g., "e12")
      text?: string,
      key?: string,
      direction?: "up" | "down",
      timeMs?: number
    }
  }
  ```
- **出力**: アクションにより異なる。snapshot → アクセシビリティツリー、read → ページテキスト
- **外部依存**: Playwright + Chromium
- **APIキー**: 不要
- **連携**: なし
- **備考**: headless: false で起動。_snapshotForAI メソッド使用（Playwright内部API）

---

## 9. read_file

- **ファイル**: `src/tools/filesystem/read-file.ts`
- **役割**: ワークスペース内のファイルを読み取る
- **入力スキーマ**:
  ```
  {
    path: string,
    offset?: number,     // 1-indexed 行番号
    limit?: number       // 読み取り行数上限
  }
  ```
- **出力**: `{path, content, truncated, totalLines}`
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: サンドボックスパス検証 (`sandbox.ts`) でアクセス制限

---

## 10. write_file

- **ファイル**: `src/tools/filesystem/write-file.ts`
- **役割**: ファイルを新規作成または上書き
- **入力スキーマ**:
  ```
  { path: string, content: string }
  ```
- **出力**: `{path, bytesWritten, message}`
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: サンドボックスパス検証。親ディレクトリ自動作成

---

## 11. edit_file

- **ファイル**: `src/tools/filesystem/edit-file.ts`
- **役割**: ファイル内の特定テキストを検索・置換 (差分編集)
- **入力スキーマ**:
  ```
  { path: string, old_text: string, new_text: string }
  ```
- **出力**: `{path, message, diff, firstChangedLine}`
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: サンドボックスパス検証。BOM/改行コード保持。曖昧マッチ対応
- **備考**: old_text がファイル内で一意でない場合はエラー

---

## 12. skill

- **ファイル**: `src/tools/skill.ts`
- **役割**: SKILL.md ファイルからワークフロー指示を読み込み、エージェントに返す
- **入力スキーマ**:
  ```
  {
    skill: string,    // スキル名 (e.g., "dcf")
    args?: string     // オプション引数 (e.g., ティッカー)
  }
  ```
- **出力**: スキルのマークダウン指示文 (エージェントがこれに従って行動)
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: `skills/registry.ts` でスキル検出、`skills/loader.ts` で SKILL.md 読み込み
- **備考**: 現在 DCF バリュエーション と X リサーチ の2スキルが内蔵

---

## 13. heartbeat

- **ファイル**: `src/tools/heartbeat/heartbeat-tool.ts`
- **役割**: 定期チェックリスト (.dexter/HEARTBEAT.md) の表示・更新
- **入力スキーマ**:
  ```
  {
    action: "view" | "update",
    content?: string       // updateの場合のみ
  }
  ```
- **出力**: チェックリスト内容 or 更新結果
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: `gateway/config.ts` (ゲートウェイ設定)、`cron/store.ts` (cronジョブ同期)
- **備考**: デフォルトは日経平均/TOPIX/日銀の市場チェック

---

## 14. cron

- **ファイル**: `src/tools/cron/cron-tool.ts`
- **役割**: 定期/一回限りのジョブをスケジューリング (作成、一覧、更新、削除、手動実行)
- **入力スキーマ**:
  ```
  {
    action: "list" | "add" | "update" | "remove" | "run",
    name?: string,
    schedule?: { kind: "at" | "every" | "cron", ... },
    message?: string,          // ジョブ実行時のエージェントプロンプト
    fulfillment?: "keep" | "once" | "ask",
    jobId?: string
  }
  ```
- **スケジュール種別**:
  - `at`: 一回限り (ISO-8601 指定)
  - `every`: 繰り返し (ミリ秒間隔、最小60秒)
  - `cron`: cron式 (5-6フィールド + タイムゾーン)
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: `cron/store.ts` (ジョブ永続化)、`cron/executor.ts` (ジョブ実行)、`cron/schedule.ts` (次回実行計算)
- **備考**: ジョブはフルツールアクセスのエージェントとして実行される。結果はWhatsApp配信

---

## 15. memory_search

- **ファイル**: `src/tools/memory/memory-search.ts`
- **役割**: MEMORY.md + 日次ログ + 過去会話を対象にセマンティック検索
- **入力スキーマ**:
  ```
  { query: string }
  ```
- **出力**: 関連するメモリエントリの配列
- **外部依存**: SQLite (better-sqlite3) + 埋め込みモデル (OpenAI / Gemini / Ollama)
- **APIキー**: 埋め込み用に LLM APIキーが必要 (OpenAI → Gemini → Ollama の優先順)
- **連携**: `memory/MemoryManager`

---

## 16. memory_get

- **ファイル**: `src/tools/memory/memory-get.ts`
- **役割**: メモリストレージの特定ファイルを直接読み取る
- **入力スキーマ**:
  ```
  {
    path: string,       // "MEMORY.md" or "2026-03-08.md"
    from?: number,      // 1-indexed
    lines?: number
  }
  ```
- **出力**: ファイル内容のテキスト
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: `memory/MemoryManager`

---

## 17. memory_update

- **ファイル**: `src/tools/memory/memory-update.ts`
- **役割**: メモリの追記、編集、削除
- **入力スキーマ**:
  ```
  {
    content?: string,                    // append用
    action?: "append" | "edit" | "delete",  // デフォルト: append
    file?: string,                       // "long_term" (→MEMORY.md) or "daily" (→今日.md)
    old_text?: string,                   // edit/delete用
    new_text?: string                    // edit用
  }
  ```
- **出力**: `{success, file, message}`
- **外部依存**: なし
- **APIキー**: 不要
- **連携**: `memory/MemoryManager`
