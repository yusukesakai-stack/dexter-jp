# Dexter JP セットアップチェックリスト

## 環境変数一覧

### 必須 (最小セット: 2個)

| 変数名 | 用途 | 取得先 | 難易度 |
|--------|------|--------|--------|
| `EDINETDB_API_KEY` | 日本株の財務データ全般 (get_financials, read_filings, company_screener) | [edinetdb.jp](https://edinetdb.jp) でアカウント作成 → APIキー発行 | 簡単 (無料枠あり) |
| LLMキー (いずれか1つ) | エージェントの思考エンジン + メタツール内部ルーティング | 下記参照 | 簡単〜普通 |

### LLMプロバイダ (いずれか1つ設定すれば動く)

| 変数名 | プロバイダ | 取得先 | 備考 |
|--------|-----------|--------|------|
| `ANTHROPIC_API_KEY` | Claude | [console.anthropic.com](https://console.anthropic.com) | 現在の設定で使用中 |
| `OPENAI_API_KEY` | OpenAI (GPT) | [platform.openai.com](https://platform.openai.com) | デフォルトプロバイダ |
| `GOOGLE_API_KEY` | Gemini | [ai.google.dev](https://ai.google.dev) | |
| `XAI_API_KEY` | Grok | [console.x.ai](https://console.x.ai) | |
| `OPENROUTER_API_KEY` | OpenRouter | [openrouter.ai](https://openrouter.ai) | 複数モデル利用可 |
| `OLLAMA_BASE_URL` | Ollama (ローカル) | [ollama.com](https://ollama.com) でインストール | APIキー不要、URLのみ |

### オプション (フルセット: 全部で最大12個)

| 変数名 | 有効化されるツール | 取得先 | 難易度 |
|--------|-------------------|--------|--------|
| `JQUANTS_API_KEY` | `get_stock_price` (東証株価) | [jpx-jquants.com](https://jpx-jquants.com) Dashboard → API Keys | 簡単 (無料、期限なし) |
| `EXASEARCH_API_KEY` | `web_search` (Exa, 最優先) | [exa.ai](https://exa.ai) | 普通 |
| `PERPLEXITY_API_KEY` | `web_search` (Perplexity, 2番手) | [perplexity.ai](https://perplexity.ai) | 普通 |
| `TAVILY_API_KEY` | `web_search` (Tavily, 3番手) | [tavily.com](https://tavily.com) | 簡単 (無料枠あり) |
| `X_BEARER_TOKEN` | `x_search` (X/Twitter) | [developer.x.com](https://developer.x.com) | やや面倒 (開発者申請) |
| `LANGSMITH_API_KEY` | LangSmith トレーシング | [smith.langchain.com](https://smith.langchain.com) | 普通 |
| `LANGSMITH_ENDPOINT` | LangSmith エンドポイント | 通常 `https://api.smith.langchain.com` | 自動 |
| `LANGSMITH_PROJECT` | LangSmith プロジェクト名 | 任意 (デフォルト: `dexter-jp`) | 自動 |
| `LANGSMITH_TRACING` | トレーシング有効/無効 | `true` or `false` | 自動 |

---

## セットアップ手順

### 1. 前提条件

- **Bun** がインストールされていること ([bun.sh](https://bun.sh))
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

### 2. リポジトリ取得 & 依存インストール

```bash
git clone https://github.com/edinetdb/dexter-jp.git
cd dexter-jp
bun install
```

`postinstall` で Playwright の Chromium も自動インストールされる。

### 3. 環境変数設定

```bash
cp env.example .env
# .env を編集して最低限 2つのキーを設定:
# - EDINETDB_API_KEY
# - LLMキー (ANTHROPIC_API_KEY 等)
```

### 4. 起動

```bash
bun run start       # 通常起動
bun run dev         # ウォッチモード (ファイル変更で自動再起動)
```

### 5. 動作確認

CLI が起動したら、以下を入力して EDINET DB API との疎通を確認:

```
トヨタの基本情報を見せて
```

`get_financials` → `get_company_info` が呼ばれ、トヨタの企業情報が返れば成功。

---

## 構成パターン

### 最小構成 (2個)
- `EDINETDB_API_KEY` + `ANTHROPIC_API_KEY`
- 使えるツール: get_financials, read_filings, company_screener, web_fetch, browser, file操作3種, skill, heartbeat, cron, memory3種 = **13ツール**

### 推奨構成 (3個)
- 上記 + `JQUANTS_API_KEY`
- 追加: get_stock_price = **14ツール**

### フル構成 (6個)
- 上記 + `EXASEARCH_API_KEY` (or TAVILY) + `X_BEARER_TOKEN`
- 追加: web_search, x_search = **16ツール** (web_searchはプロバイダ1つなので16)
- 全17ツールスロットが埋まる

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `EDINETDB_API_KEY not set` | .env にキーが未設定 | edinetdb.jp でキーを取得して .env に記入 |
| `bun: command not found` | Bun 未インストール | `curl -fsSL https://bun.sh/install \| bash` |
| LLM 応答なし | APIキーが無効 or プロバイダ選択ミス | `.dexter/settings.json` のプロバイダを確認 |
| `Playwright: browser not found` | Chromium 未インストール | `bun run postinstall` または `npx playwright install chromium` |
