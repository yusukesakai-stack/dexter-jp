# Dexter JP 統合ブリーフィング

> 半年後の自分へ: このファイルを読めば15分でプロジェクト全体を思い出せる。

---

## 1. 30秒サマリ

Dexter JP は、ターミナルで動く日本株特化の自律型AIリサーチエージェント。「ソニーと任天堂を投資先として比較して」と1回聞くだけで、エージェントが自分で計画を立て、EDINET有報・決算短信・株価・Webを横断し、分析レポートを自動生成する。virattt/dexter (米国株版) を 2026年3月にフォークし、データソースを EDINET DB + J-Quants に全面差替えしたもの。TypeScript + LangChain + Ink (React CLI) 構成、LLMは Claude/GPT/Gemini/Grok/Ollama を切替可能。

---

## 2. アーキテクチャの核心 (3分)

### データの流れ

```
ユーザー (ターミナル入力)
  ↓
CLI層: index.tsx → cli.ts (Ink/React)
  ↓
エージェント層: agent.ts (ループ: 計画 → ツール選択 → 実行 → 検証 → 繰り返し)
  ↓                          ↕ LLM層: llm.ts (マルチプロバイダ抽象化)
ツール層: registry.ts (17ツールを条件付き登録)
  ↓
外部API: EDINET DB / J-Quants / Exa / X API / Web
  ↓
エージェントが結果を統合 → 構造化レポート出力
```

エージェントは「1回のやり取り」ではなく「ループ」で動く。LLMが「まだデータが足りない」と判断すれば追加のツール呼び出しを自分で行い、矛盾があれば検証を挟む。この自律ループが Dexter の核心。

### 最重要ファイル TOP 3

| 順位 | ファイル | なぜ重要か |
|------|---------|-----------|
| 1 | `src/agent/agent.ts` | エージェントのメインループ。LLMにツール群をバインドし、思考→実行→検証のサイクルを制御する。プロジェクトの心臓部 |
| 2 | `src/tools/finance/get-financials.ts` | 「メタツール」パターンの実装。内部にもう1つLLMを持ち、自然言語クエリから適切なサブツール (5種) を選択・並列実行する。company_screener も同じパターン |
| 3 | `src/agent/prompts.ts` | システムプロンプト。SOUL.md の投資哲学がどうプロンプトに変換されるか、ツールの使い分け指示、出力フォーマット制御がすべてここにある |

補足で読むなら: `src/tools/registry.ts` (どのツールがどの条件で登録されるか) と `src/model/llm.ts` (LLMプロバイダの切替ロジック)。

---

## 3. 17ツールの分類と関係性 (5分)

### カテゴリ一覧

**A. 金融データ (4ツール)** — プロジェクトの主戦場

| ツール | 一言 | 特徴 |
|--------|------|------|
| `get_financials` | 財務データの統合窓口 | メタツール。内部LLMが5つのサブツール (financial_statements / company_info / key_ratios / analysis / earnings) を自動選択・並列実行 |
| `read_filings` | 有報テキスト読取 | text-blocks (事業リスク, MD&A) と shareholders (大量保有) の2モード |
| `company_screener` | 銘柄スクリーニング | メタツール。自然言語 → 100+指標の構造化条件に変換 |
| `get_stock_price` | 株価取得 | J-Quants V2。OHLC日次。JQUANTS_API_KEY 設定時のみ有効 |

**B. Web検索 (2ツール)** — 外部情報の補完

| ツール | 一言 | 特徴 |
|--------|------|------|
| `web_search` | 汎用Web検索 | Exa → Perplexity → Tavily の優先順で切替。いずれかのキー必要 |
| `x_search` | X/Twitter検索 | search / profile / thread の3コマンド。直近7日間のみ |

**C. Webアクセス (2ツール)** — ページの中身を読む

| ツール | 一言 | 特徴 |
|--------|------|------|
| `web_fetch` | 軽量ページ取得 | URL→Readabilityでテキスト抽出。15分キャッシュ。まずこちらを使う |
| `browser` | Playwright操作 | JS描画が必要な場合のみ。navigate→snapshot→act→readのワークフロー |

**D. ファイル操作 (3ツール)** — エージェントの手足

| ツール | 一言 |
|--------|------|
| `read_file` | ワークスペースのファイル読取。offset/limit でページネーション可 |
| `write_file` | 新規作成 or 全上書き。親ディレクトリ自動作成 |
| `edit_file` | 差分編集 (find & replace)。old_text は一意でないとエラー |

**E. メモリ・システム (6ツール)** — 記憶と自動化

| ツール | 一言 | 特徴 |
|--------|------|------|
| `memory_search` | セマンティック検索 | SQLite + 埋め込みベクトルで MEMORY.md + 日次ログ + 過去会話を横断検索 |
| `memory_get` | メモリ直接読取 | 特定ファイルの特定行を取得 |
| `memory_update` | メモリ追記/編集/削除 | MEMORY.md (長期) or 日次ログに書込み |
| `skill` | ワークフロー実行 | SKILL.md を読んで指示を返す。現在 DCF + X-research の2スキル内蔵 |
| `heartbeat` | 定期チェックリスト | .dexter/HEARTBEAT.md の管理。日経/TOPIX/日銀がデフォルト |
| `cron` | スケジュールジョブ | at/every/cron の3種。ジョブはフルツールアクセスのエージェントとして実行 |

### カテゴリ間の連携パターン

```
典型的な分析フロー:
  get_financials (財務データ取得)
    → read_filings (有報テキストで補完)
      → web_search (最新ニュースで裏取り)
        → skill:dcf (DCFバリュエーション実行)
          → write_file (レポート書き出し)

典型的なスクリーニングフロー:
  company_screener (条件に合う銘柄を検索)
    → get_financials (上位銘柄の詳細取得)
      → read_filings (リスク要因確認)

定期監視フロー:
  cron (スケジュール起動)
    → heartbeat (チェックリスト読取)
      → get_financials + web_search (データ収集)
        → memory_update (変化を記録)
          → WhatsApp通知 (gateway経由)
```

重要: get_financials と company_screener は内部にLLMを持つ「メタツール」。外側のエージェントLLMがこれらを呼ぶと、内側のLLMがさらにサブツールを選択する二重構造になっている。

---

## 4. 設計思想 (3分)

### 何を大切にしているか

**SOUL.md から抽出した4原則:**

1. **推測禁止・データ先行**: データを集めてから見解を持つ。この順序が絶対。確認できない情報は「分からない」と言う
2. **一次ソース主義**: 有価証券報告書 (EDINET) が真実の源泉。翻訳や要約ではなく原文を読む
3. **Buffett/Munger 哲学**: 安全余裕、逆転思考 (「なぜ失敗するか」から考える)、能力の輪を超えない
4. **簡潔さ**: パディングなし、自分の思考過程を実況しない。答えが簡潔なら短く返す

**AGENTS.md から抽出した技術原則:**

1. **TypeScript strict、any 禁止**: 型で守る
2. **ファイルは簡潔に**: 重複よりヘルパー抽出
3. **ログは追加しない** (明示指示がない限り)
4. **README/ドキュメントは勝手に作らない**
5. **bun が primary ランタイム**: npm/node ではなく bun を使う

### やってはいけないこと

- 確認できないデータに基づく分析や推奨
- 投資の売買推奨 (分析は出すが最終判断はユーザーに委ねる)
- データを集める前に結論を出す
- 型の緩い実装 (`any`, 型アサーション乱用)
- git コミット・プッシュ (ユーザーが手動で行う)
- 既存ファイルの無断編集 (diff提示 → 承認が必須)

---

## 5. 次の一歩: Session 3 (3分)

### APIキー確認 (取得難易度順)

| 優先度 | キー | 状態 | 取得難易度 |
|--------|------|------|-----------|
| ★必須 | `EDINETDB_API_KEY` | ✅ 設定済み | — |
| ★必須 | `ANTHROPIC_API_KEY` | ✅ 設定済み | — |
| 推奨 | `JQUANTS_API_KEY` | ✅ 設定済み | — |
| 任意 | `TAVILY_API_KEY` | ❌ 未設定 | 低 (無料枠あり、即発行) |
| 任意 | `X_BEARER_TOKEN` | ❌ 未設定 | 中 (開発者申請が必要) |

→ 必須キーはすべて設定済み。今すぐ起動可能。

### 起動コマンド

```bash
cd /Users/sakaiyusuke/dexter-jp
bun run start
```

### 最初に試すべきクエリ 3つ

**① 疎通確認 (get_financials → get_company_info)**
```
トヨタの基本情報を教えて
```
→ EDINET DB API が正常に応答するか、ティッカー解決 ("トヨタ" → E02144) が動くかを確認

**② メタツールの動作確認 (get_financials → 複数サブツール並列)**
```
ソニーの直近3年の売上・営業利益・ROEの推移を見せて
```
→ 内部LLMが get_financial_statements + get_key_ratios を選択し、並列実行するかを確認

**③ 自律分析の確認 (複数ツール連携)**
```
キーエンスの競争力を分析して。財務データとリスク要因を踏まえて簡潔にまとめて
```
→ エージェントが自律的に get_financials → read_filings → レポート生成のフローを回すかを確認

### Session 3 のタスク案

1. 上記3クエリで動作確認
2. `bun test` でテスト状態を把握
3. CLAUDE.md 作成 (この briefing.md を元に開発ルールを明文化)
4. yuho-generator との連携設計を議論開始
