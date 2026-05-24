# Session 5b 設計書: 新ツール3本の実装設計

> 2026-05-25 作成
> 対象: get_company_history, get_ranking, get_earnings_calendar

---

## 1. 既存ツールのパターン分析

### ファイル構成

既存の金融ツールはすべて `src/tools/finance/` 配下に置かれている。

```
src/tools/finance/
├── api.ts              # REST クライアント (BASE_URL, get/post, キャッシュ, エラーハンドリング)
├── resolver.ts         # ティッカー解決 (会社名/証券コード → EDINET コード)
├── utils.ts            # 定数 (タイムアウト, キャッシュ TTL)
├── index.ts            # 再エクスポート (barrel file)
├── financials.ts       # get_financial_statements, get_company_info (単体ツール)
├── key-ratios.ts       # get_key_ratios, get_analysis (単体ツール)
├── earnings.ts         # get_earnings (単体ツール)
├── text-blocks.ts      # get_text_blocks (単体ツール)
├── shareholders.ts     # get_shareholders (単体ツール)
├── stock-price.ts      # get_stock_price (J-Quants 用, 独自 API クライアント)
├── get-financials.ts   # メタツール (内部 LLM ルーティング)
├── read-filings.ts     # メタツール (内部 LLM ルーティング)
└── screen-companies.ts # メタツール (内部 LLM ルーティング)
```

**パターン**: 単体ツール (1ファイル = 1ツール) と メタツール (内部LLMで複数サブツールを束ねる) の2種類。今回追加する3本はすべて **単体ツール** パターン。

### 入力スキーマパターン

```typescript
import { z } from 'zod';

const XxxInputSchema = z.object({
  ticker: z.string().describe("Securities code (e.g. '7203') or EDINET code ..."),
  // オプショナルパラメータは .optional() + .describe()
  fiscal_year: z.number().optional().describe("Fiscal year (e.g. 2025). ..."),
});
```

- `ticker` は全金融ツール共通の最頻パラメータ (resolver.ts で解決)
- `.describe()` は LLM のパラメータ理解に重要 → 日英併記で具体例を含める
- enum は `z.enum([...])` を使用

### 内部処理フロー

```
1. 入力パラメータ受取 (Zod でバリデーション済み)
2. resolveEdinetCode(input.ticker) でティッカー解決 (会社固有ツールの場合)
3. api.get(endpoint, params, options?) で REST API 呼び出し
4. response.data から必要なデータを抽出
5. formatToolResult(data, [url]) で統一フォーマットに変換して返却
```

### エラーハンドリング規約

- `api.ts` が HTTP エラー (4xx/5xx) を `throw new Error(...)` で投げる
- 各ツールは try/catch で捕捉し `formatToolResult({ error: ... }, [])` を返す
- **ただし**: 多くの単体ツール (financials.ts, key-ratios.ts, earnings.ts) は try/catch を書いていない → api.ts のエラーがそのまま LangChain に伝播し、エージェントが再試行判断する設計
- **推奨**: 新ツールも try/catch なしで api.ts に任せる (既存パターンに統一)

### registry.ts 登録パターン

```typescript
// 1. import
import { xxxTool, XXX_DESCRIPTION } from './finance/xxx.js';

// 2. tools 配列に追加
{
  name: 'xxx',
  tool: xxxTool,                          // DynamicStructuredTool インスタンス
  description: XXX_DESCRIPTION,            // 複数行の rich description (export const)
  compactDescription: '1-2行の要約',       // システムプロンプト用
  concurrencySafe: true,                   // 読み取り専用なら true
},
```

- `description` (rich): `## When to Use` / `## When NOT to Use` / `## Usage Notes` のセクション構成
- `compactDescription`: トークン節約版。1-2文
- `concurrencySafe`: 副作用のないツールは `true`

---

## 2. 各 API の仕様 (公式ドキュメントより)

### 2.1 get_company_history

**エンドポイント**: `GET /v1/companies/{code}/history`

**パラメータ**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| from_year | number | No | — | 開始年 |
| to_year | number | No | — | 終了年 |
| event_type | string | No | — | カンマ区切り: founding, listing, delisting, renaming, merger, acquisition, divestiture, subsidiary_change, business_change, facility, management, other |
| event_category | string | No | — | イベントカテゴリ |
| is_overseas | boolean | No | — | 海外イベントフィルタ |
| geography | string | No | — | 地理フィルタ |
| include_raw | boolean | No | true | 生テキスト含める |
| include_metadata | boolean | No | false | メタデータ含める |
| include_historical_diff | boolean | No | false | 過去年度のみのイベント (廃止子会社等) も返す |
| limit | number | No | 200 (max 1000) | 最大件数 |

**レスポンス主要フィールド** (API 仕様書より):

```
event_year          # イベント発生年
event_month         # イベント発生月
event_type          # founding / listing / merger / acquisition 等
event_subtype       # サブタイプ
event_category      # カテゴリ
raw_event_text      # 原文テキスト
entity_mentions     # ARRAY: {name, entity_type, role}
source_docID        # EDINET 提出書類 ID
source_url          # EDINET 原本リンク
```

**確認用 curl** (酒井さんに実行依頼):

```bash
curl -s "https://edinetdb.jp/v1/companies/E02144/history?limit=3" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -60
```

### 2.2 get_ranking

**エンドポイント**: `GET /v1/rankings/{metric}`

**パスパラメータ**:

- `metric`: roe, operating-margin, net-margin, roa, equity-ratio, per, eps, dividend-yield, payout-ratio, revenue, health-score, revenue-growth, ni-growth, eps-growth, revenue-cagr-3y, oi-cagr-3y, ni-cagr-3y, eps-cagr-3y

**クエリパラメータ**: 仕様書に詳細記載なし。limit / industry 等がある可能性 → 実データで要確認

**レスポンス**: 仕様書に詳細フィールド記載なし → 実データで要確認

**確認用 curl**:

```bash
curl -s "https://edinetdb.jp/v1/rankings/roe?limit=5" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -60
```

### 2.3 get_earnings_calendar

**エンドポイント**: `GET /v1/calendar`

**パラメータ**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| from | string (YYYY-MM-DD) | No | — | 開始日 |
| to | string (YYYY-MM-DD) | No | — | 終了日 |
| code | string | No | — | 証券コード |
| market | string | No | — | prime / standard / growth |
| sort | string | No | date | date / marketCap |
| order | string | No | — | asc / desc |
| limit | number | No | 500 (max 2000) | 最大件数 |

**レスポンス主要フィールド** (API 仕様書より):

```
marketCap                  # 有報期末ベース時価総額 (円、null 可)
marketCapAsOfFiscalYear    # 時価総額算出基準年度
# + 決算日, 企業名, 業種, 市場区分, 期次種別 (本決算/四半期)
```

**確認用 curl**:

```bash
curl -s "https://edinetdb.jp/v1/calendar?from=2026-05-20&to=2026-05-30&limit=5" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -60
```

---

## 3. 新ツール3本の設計

### 3.1 get_company_history

**ファイルパス**: `src/tools/finance/history.ts`

**入力 Zod スキーマ**:

```typescript
const HistoryInputSchema = z.object({
  ticker: z.string().describe(
    "Securities code (e.g. '7203' for Toyota) or EDINET code (e.g. 'E02144'). Company names also work (e.g. 'トヨタ', 'Sony')."
  ),
  from_year: z.number().optional().describe(
    'Start year for filtering events (e.g. 2000). If omitted, returns all available history.'
  ),
  to_year: z.number().optional().describe(
    'End year for filtering events (e.g. 2025). If omitted, returns up to the latest.'
  ),
  event_type: z.string().optional().describe(
    "Filter by event type. Comma-separated values from: founding, listing, delisting, renaming, merger, acquisition, divestiture, subsidiary_change, business_change, facility, management, other."
  ),
  limit: z.number().optional().describe(
    'Maximum number of events to return (default: 200, max: 1000).'
  ),
});
```

**出力フォーマット**: `formatToolResult(response.data || response, [url])`

**description (LLM 用)**:

```typescript
export const HISTORY_DESCRIPTION = `
Retrieves the corporate history timeline for a Japanese listed company. Returns chronological events including: founding, listing, mergers & acquisitions, divestitures, name changes, subsidiary changes, business changes, facility events, and management events.

## When to Use

- Understanding a company's historical evolution and milestones
- Tracing M&A history (mergers, acquisitions, divestitures)
- Checking when a company was founded, listed, or renamed
- Analyzing corporate restructuring history
- Understanding subsidiary and business segment changes over time

## When NOT to Use

- Current financial data (use get_financials)
- Securities report text content (use read_filings)
- Stock screening (use company_screener)

## Usage Notes

- Returns events sorted chronologically
- Each event includes: year, month, event type, raw text, and entity mentions
- Filter by event_type for focused analysis (e.g., only M&A events)
- Use from_year/to_year to narrow the time range
`.trim();
```

**registry 登録** (compactDescription):

```
'Corporate history timeline (founding, M&A, listing, name changes). 246,000+ events across all companies.'
```

**キャッシュ**: `cacheable: true` (沿革データは不変)

---

### 3.2 get_ranking

**ファイルパス**: `src/tools/finance/ranking.ts`

**入力 Zod スキーマ**:

```typescript
const RankingInputSchema = z.object({
  metric: z.enum([
    'roe', 'operating-margin', 'net-margin', 'roa', 'equity-ratio',
    'per', 'eps', 'dividend-yield', 'payout-ratio', 'revenue',
    'health-score', 'revenue-growth', 'ni-growth', 'eps-growth',
    'revenue-cagr-3y', 'oi-cagr-3y', 'ni-cagr-3y', 'eps-cagr-3y',
  ]).describe(
    'Financial metric to rank companies by.'
  ),
  limit: z.number().optional().describe(
    'Number of top companies to return (default: 20).'
  ),
});
```

**出力フォーマット**: `formatToolResult(response.data || response, [url])`

**description (LLM 用)**:

```typescript
export const RANKING_DESCRIPTION = `
Retrieves financial metric rankings for Japanese listed companies. Returns top companies ranked by a specific metric (e.g., highest ROE, best dividend yield).

## When to Use

- Finding top-performing companies by a specific metric
- Industry benchmarking and market overview
- Identifying investment candidates by financial performance
- Comparing relative standings across all listed companies

## When NOT to Use

- Multi-condition screening (use company_screener)
- Specific company financials (use get_financials)
- Historical trends for a single company (use get_financials)

## Usage Notes

- Returns companies ranked by the specified metric in descending order
- Supported metrics: ROE, operating margin, net margin, ROA, equity ratio, PER, EPS, dividend yield, payout ratio, revenue, health score, revenue/NI/EPS growth, 3Y CAGRs
- Use limit to control the number of results
`.trim();
```

**registry 登録** (compactDescription):

```
'Financial metric ranking (ROE, margins, growth, yield). Top companies by any of 18 metrics.'
```

**キャッシュ**: `cacheable: true, ttlMs: TTL_1H` (ランキングは日次更新だが頻繁なリクエスト回避)

**注意**: このツールは ticker を取らない (会社横断のランキング)。resolver は不要。

---

### 3.3 get_earnings_calendar

**ファイルパス**: `src/tools/finance/calendar.ts`

**入力 Zod スキーマ**:

```typescript
const CalendarInputSchema = z.object({
  from: z.string().optional().describe(
    "Start date (YYYY-MM-DD). If omitted, defaults to today."
  ),
  to: z.string().optional().describe(
    "End date (YYYY-MM-DD). If omitted, defaults to 2 weeks from 'from' date."
  ),
  code: z.string().optional().describe(
    "Securities code (e.g. '7203') to check a specific company's earnings date."
  ),
  market: z.enum(['prime', 'standard', 'growth']).optional().describe(
    'Filter by TSE market segment.'
  ),
  limit: z.number().optional().describe(
    'Maximum number of results (default: 100, max: 2000).'
  ),
});
```

**出力フォーマット**: `formatToolResult(response.data || response, [url])`

**description (LLM 用)**:

```typescript
export const CALENDAR_DESCRIPTION = `
Retrieves the JPX earnings announcement schedule. Shows when Japanese listed companies are scheduled to disclose their financial results.

## When to Use

- Checking upcoming earnings announcements
- Planning around earnings season
- Finding out when a specific company reports earnings
- Filtering by market segment (Prime, Standard, Growth)

## When NOT to Use

- Actual earnings results (use get_financials → get_earnings)
- Company screening by financial metrics (use company_screener)
- Historical financial data (use get_financials)

## Usage Notes

- Data sourced from JPX (Tokyo Stock Exchange), updated daily
- Use from/to for date range queries
- Use code to check a specific company's announcement date
- marketCap is based on securities report data (not real-time stock price)
`.trim();
```

**registry 登録** (compactDescription):

```
'JPX earnings announcement schedule. Upcoming disclosure dates by company, market, and date range.'
```

**キャッシュ**: `cacheable: true, ttlMs: TTL_1H` (日次更新)

**注意**: このツールも会社固有ではない (code はオプション)。resolver は code 指定時のみ使用する可能性があるが、calendar API は証券コードをそのまま受けるため resolver 不要。

---

## 4. registry.ts への追加計画

```typescript
// 新規 import (3行追加)
import { historyTool, HISTORY_DESCRIPTION } from './finance/history.js';
import { rankingTool, RANKING_DESCRIPTION } from './finance/ranking.js';
import { calendarTool, CALENDAR_DESCRIPTION } from './finance/calendar.js';

// tools 配列に追加 (company_screener の後、web_fetch の前)
{
  name: 'get_company_history',
  tool: historyTool,
  description: HISTORY_DESCRIPTION,
  compactDescription: 'Corporate history timeline (founding, M&A, listing, name changes). 246,000+ events across all companies.',
  concurrencySafe: true,
},
{
  name: 'get_ranking',
  tool: rankingTool,
  description: RANKING_DESCRIPTION,
  compactDescription: 'Financial metric ranking (ROE, margins, growth, yield). Top companies by any of 18 metrics.',
  concurrencySafe: true,
},
{
  name: 'get_earnings_calendar',
  tool: calendarTool,
  description: CALENDAR_DESCRIPTION,
  compactDescription: 'JPX earnings announcement schedule. Upcoming disclosure dates by company, market, and date range.',
  concurrencySafe: true,
},
```

### index.ts への追加

```typescript
export { historyTool, HISTORY_DESCRIPTION } from './history.js';
export { rankingTool, RANKING_DESCRIPTION } from './ranking.js';
export { calendarTool, CALENDAR_DESCRIPTION } from './calendar.js';
```

---

## 5. 実装順序

1. **get_company_history** — お手本として丁寧に実装。resolver + api.get + cacheable のフルパターン
2. **get_ranking** — パターンコピー。ticker なし、metric パスパラメータ
3. **get_earnings_calendar** — パターンコピー。ticker なし、日付範囲クエリ

各ツールの実装後:
- `bun run typecheck` でエラーゼロ確認
- `bun run start` で起動確認
- 動作テスト (ユーザーがターミナルで実行)

---

## 6. 要確認事項 (酒井さんへ)

以下の curl をターミナルで実行し、レスポンス JSON の構造を確認してください。
実装前にフィールド名を正確に把握するためです。

```bash
cd ~/dexter-jp

# 1. History (トヨタ, 3件)
curl -s "https://edinetdb.jp/v1/companies/E02144/history?limit=3" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -80

# 2. Ranking (ROE, 5件)
curl -s "https://edinetdb.jp/v1/rankings/roe?limit=5" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -80

# 3. Calendar (直近2週間, 5件)
curl -s "https://edinetdb.jp/v1/calendar?from=2026-05-25&to=2026-06-08&limit=5" \
  -H "X-API-Key: $(grep EDINETDB_API_KEY .env | cut -d= -f2)" | python3 -m json.tool | head -80
```

結果をスクリーンショットで共有いただければ、Step 2 (実装) に反映します。
フィールド名が設計書と異なる場合は実装時に調整します。
