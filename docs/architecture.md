# Dexter JP アーキテクチャ

## 1. 全体構成図

```mermaid
flowchart TD
    User["ユーザー (ターミナル)"]

    subgraph CLI["CLI 層"]
        Entry["index.tsx<br/>(エントリポイント)"]
        CliApp["cli.ts<br/>(Ink/React CLI)"]
        Components["components/<br/>(UI コンポーネント)"]
    end

    subgraph Agent["エージェント層"]
        AgentLoop["agent.ts<br/>(エージェントループ)"]
        Prompts["prompts.ts<br/>(システムプロンプト)"]
        Scratchpad["scratchpad.ts<br/>(コンテキスト管理)"]
        ToolExec["tool-executor.ts<br/>(ツール実行)"]
        TokenCounter["token-counter.ts<br/>(トークン計算)"]
    end

    subgraph LLM["LLM 層"]
        LLMAbstraction["model/llm.ts<br/>(マルチプロバイダ抽象化)"]
        Providers["providers.ts<br/>(OpenAI / Anthropic / Google / xAI / Ollama)"]
    end

    subgraph Tools["ツール層 (registry.ts)"]
        direction LR
        FinanceTools["金融ツール群"]
        SearchTools["検索ツール群"]
        BrowserTools["ブラウザ/Fetch"]
        FileTools["ファイル操作"]
        SystemTools["システムツール群"]
    end

    subgraph Memory["メモリ層"]
        MemManager["memory/<br/>(MemoryManager)"]
        SQLite["better-sqlite3<br/>(ベクトル検索)"]
        MemFiles[".dexter/memory/<br/>(MEMORY.md, 日次ログ)"]
    end

    subgraph Skills["スキル層"]
        SkillRegistry["skills/registry.ts"]
        SkillLoader["skills/loader.ts"]
        DCFSkill["skills/dcf/SKILL.md"]
        XResearch["skills/x-research/SKILL.md"]
    end

    subgraph ExternalAPIs["外部 API"]
        EDINETDB["EDINET DB API<br/>(edinetdb.jp)"]
        JQuants["J-Quants V2 API<br/>(jpx-jquants.com)"]
        ExaAPI["Exa / Perplexity / Tavily"]
        XAPI["X/Twitter API v2"]
        WebPages["一般 Web ページ"]
    end

    User --> Entry --> CliApp --> Components
    CliApp --> AgentLoop
    AgentLoop --> Prompts
    AgentLoop --> Scratchpad
    AgentLoop --> ToolExec
    AgentLoop --> TokenCounter
    AgentLoop --> LLMAbstraction --> Providers

    ToolExec --> Tools
    FinanceTools --> EDINETDB
    FinanceTools --> JQuants
    SearchTools --> ExaAPI
    SearchTools --> XAPI
    BrowserTools --> WebPages
    SystemTools --> Memory
    SystemTools --> Skills

    MemManager --> SQLite
    MemManager --> MemFiles

    SkillRegistry --> SkillLoader
    SkillLoader --> DCFSkill
    SkillLoader --> XResearch
```

## 2. ツール分類マップ

```mermaid
mindmap
  root((Dexter JP ツール<br/>17個))
    金融データ (4)
      get_financials
        内部にLLMルーター
        サブツール: financial_statements, company_info, key_ratios, analysis, earnings
      read_filings
        有報テキスト
        大量保有報告書
      company_screener
        100+指標スクリーニング
        内部にLLMで条件変換
      get_stock_price
        J-Quants V2
        OHLC日次データ
    Web検索 (2)
      web_search
        Exa優先 → Perplexity → Tavily
      x_search
        X/Twitter API v2
        search/profile/thread
    Webアクセス (2)
      web_fetch
        URL→テキスト抽出
        Readabilityベース
      browser
        Playwright制御
        JS描画対応
    ファイル操作 (3)
      read_file
      write_file
      edit_file
    メモリ (3)
      memory_search
        セマンティック検索
      memory_get
        ファイル直接読取
      memory_update
        追記/編集/削除
    システム (3)
      skill
        SKILL.md実行
      heartbeat
        定期チェックリスト
      cron
        スケジュールジョブ
```

## 3. データフロー例: 「トヨタの財務分析して」

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant CLI as CLI (Ink)
    participant Agent as エージェントループ
    participant LLM as LLM (Claude等)
    participant Registry as ツールレジストリ
    participant GetFin as get_financials
    participant SubLLM as 内部LLM (ルーター)
    participant SubTools as サブツール群
    participant EDINET as EDINET DB API

    User->>CLI: 「トヨタの財務分析して」
    CLI->>Agent: ユーザーメッセージ転送
    Agent->>LLM: システムプロンプト + メッセージ + ツール定義

    Note over LLM: 計画: まず財務データを取得、<br/>次に有報のリスク要因を読み、<br/>最後にレポートにまとめる

    LLM-->>Agent: tool_call: get_financials("トヨタの財務データ")
    Agent->>Registry: ツール検索 "get_financials"
    Registry->>GetFin: 実行

    Note over GetFin: メタツール: 内部LLMで<br/>どのサブツールを呼ぶか判断

    GetFin->>SubLLM: ルーティングプロンプト + クエリ
    SubLLM-->>GetFin: tool_calls: [get_key_ratios("E02144"), get_financial_statements("E02144")]

    par 並列実行
        GetFin->>SubTools: get_key_ratios
        SubTools->>EDINET: GET /companies/E02144
        EDINET-->>SubTools: {name, industry, latest_financials, credit_score}
    and
        GetFin->>SubTools: get_financial_statements
        SubTools->>EDINET: GET /companies/E02144/financials?years=3
        EDINET-->>SubTools: {financials: [{year, revenue, oi, ni, ...}]}
    end

    SubTools-->>GetFin: 統合結果
    GetFin-->>Agent: JSON結果 + ソースURL

    Note over Agent: ツール結果をスクラッチパッドに格納

    LLM-->>Agent: tool_call: read_filings("トヨタ", type="text-blocks")
    Agent->>Registry: read_filings 実行
    Registry->>EDINET: GET /companies/E02144/text-blocks
    EDINET-->>Agent: 有報テキスト (事業リスク, MD&A等)

    Note over LLM: 全データが揃った。<br/>分析レポートを生成。

    LLM-->>Agent: 最終レポート (構造化テキスト)
    Agent-->>CLI: レポート表示
    CLI-->>User: ターミナルにレンダリング
```

### フロー解説

1. **ユーザー入力**: CLI (Ink) がターミナルで入力を受け取る
2. **エージェント判断**: LLMがシステムプロンプトとツール定義を参照し、必要なツールを選択
3. **get_financials (メタツール)**: 内部にもう1つLLMを持ち、クエリに応じてサブツール (key_ratios, financial_statements, analysis, earnings, company_info) を自動選択・並列実行
4. **read_filings**: 有報のテキスト部分（事業リスク、経営分析など）を取得
5. **レポート生成**: 全データを統合し、構造化された分析レポートを出力

重要なのは「エージェントが自分で計画を立て、複数ツールを順序立てて呼び出す」点。ユーザーは1回質問するだけで、裏側では複数のAPI呼び出しが自律的に実行される。
