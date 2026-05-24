# EDINET DB MCP 統合戦略

> Session 5a (2026-05-24) 作成
> `docs/tool_mapping.md` の調査結果に基づく統合方針の提案

---

## 調査で判明した事実

1. **既存の金融ツール 4 本はすべて EDINET DB REST API (`edinetdb.jp/v1`) を直接叩いている**
   - get_financials → 5 つのサブツールが 4 つのエンドポイントを使用
   - read_filings → 2 つのサブツールが 2 つのエンドポイントを使用
   - company_screener → `/v1/screener`
   - get_stock_price → J-Quants V2 (これだけ別サービス)

2. **EDINET DB MCP は 15 ツール** (当初の想定 48 とは異なる)

3. **重複は 6 組** — 既存サブツールと MCP ツールが同じ REST エンドポイントを叩く

4. **MCP にしかない機能は 9 本** — うち高優先度は `get_earnings_calendar` と `get_ranking`

5. **REST API にはあるが MCP にもない機能が 25+ エンドポイント** — `history` (沿革)、`segments` (セグメント)、`events` (イベントフィード)、`peer-comparison` (同業比較) 等

---

## 統合戦略の選択肢

### 案α: 最小統合 (REST API で沿革ツール 1 本だけ追加)

- **追加するもの**: `get_company_history` ツール 1 本 (REST API `/v1/companies/{code}/history` を直接叩く)
- **既存ツールとの関係**: 変更なし。既存の `api.ts` インフラをそのまま活用
- **MCP 統合**: しない (MCP に history は含まれていないため、MCP 接続は不要)
- **メリット**:
  - 影響範囲ゼロ。既存コードに触らない
  - 実装 30 分以内。既存の `api.ts` + `resolver.ts` をそのまま使える
  - テスト容易 (1 ツールのみ)
- **デメリット**:
  - 決算カレンダー、ランキング、販管費内訳等の新機能は追加されない
  - MCP の恩恵 (認証自動化、セッション管理) を受けられない
- **実装工数**: 0.5h

### 案β: 補完統合 (既存にない機能だけ REST API で追加)

- **追加するツール** (REST API 直接呼び出し、既存 `api.ts` 経由):

  | ツール名 | REST エンドポイント | 優先度 |
  |---|---|---|
  | get_company_history | `/v1/companies/{code}/history` | 高 |
  | get_earnings_calendar | `/v1/calendar` | 高 |
  | get_ranking | `/v1/rankings/{metric}` | 高 |
  | get_segments | `/v1/companies/{code}/segments` | 高 |
  | get_peer_comparison | `/v1/queries/peer-comparison` | 高 |
  | get_financial_trajectory | `/v1/queries/financial-trajectory` | 高 |
  | get_red_flags | `/v1/queries/red-flags` | 高 |
  | get_detailed_expenses | `/v1/companies/{code}/expenses` | 中 |
  | get_events | `/v1/events` | 中 |
  | get_directors | `/v1/companies/{code}/directors` | 中 |

- **既存ツールとの関係**: 変更なし。純粋に新規追加のみ
- **MCP 統合**: しない (REST API で十分。既存インフラと一貫性が保てる)
- **メリット**:
  - 既存コードへの影響ゼロ
  - 分析能力が大幅に向上 (セグメント、同業比較、レッドフラグ等)
  - 既存の `api.ts` / `resolver.ts` / `formatToolResult` をそのまま再利用
  - 段階的に追加可能 (高優先度 7 本 → 中優先度 3 本)
- **デメリット**:
  - ツール数が増える (17 → 24-27)。エージェントの選択精度に影響の可能性
  - MCP の利点 (プロトコル標準化、認証簡素化) を活用しない
- **実装工数**: 高優先度 7 本で 3-4h、全 10 本で 5-6h

### 案γ: 全面置換 (MCP クライアントとして接続、既存の REST 呼び出しを廃止)

- **変更内容**:
  1. MCP クライアントライブラリを追加 (`@modelcontextprotocol/sdk`)
  2. 既存の `api.ts` を MCP トランスポート経由に置換
  3. 既存メタツール (get_financials, read_filings) を MCP ツールに差替え
  4. MCP にない機能 (shareholders, stock_price) は REST API を残す
- **メリット**:
  - MCP プロトコル標準に準拠。将来の拡張 (通知、リソース) に対応
  - 認証がセッション単位で管理される
  - EDINET DB 側がツールを追加すれば自動で使える可能性
- **デメリット**:
  - **大規模リファクタリングが必要** — メタツールの二重 LLM 構造、キャッシュ機構、エラーハンドリングをすべて書き直す
  - **既存テスト (36本) への影響** — API 層の変更でテストが壊れる可能性
  - **MCP に含まれない機能が多い** — history, segments, events, peer-comparison, red-flags, directors 等 25+ エンドポイントは REST API のままになり、二重のデータアクセス層が残る
  - **レイテンシ増加** — MCP のセッション管理オーバーヘッド
  - **デバッグ困難** — MCP 層が間に入ることで問題切り分けが複雑化
  - **メタツールの知的資産を捨てることになる** — get_financials の内部 LLM ルーティングは Dexter の競争優位
- **実装工数**: 15-20h (テスト修正含む)

---

## 推奨案: β (補完統合)

### 理由

1. **既存の強みを壊さない**: メタツール (get_financials, company_screener) の二重 LLM 構造は Dexter の核心的な差別化要因。自然言語で「トヨタの直近3年の売上推移」と言うだけで適切なサブツールとパラメータが選ばれる仕組みは、MCP の構造化パラメータ方式より優れている

2. **既存インフラの再利用**: `api.ts` (REST クライアント)、`resolver.ts` (ティッカー解決)、`formatToolResult` (出力フォーマット)、キャッシュ機構がすべてそのまま使える。新ツールは既存パターンのコピーで作れる

3. **分析能力の飛躍的向上**: 沿革、セグメント、同業比較、レッドフラグ、決算カレンダーが追加されることで、Dexter の投資分析の深さが大幅に増す。SOUL.md の「Buffett/Munger 哲学」に沿った「完全な分析」が可能になる

4. **段階的実装が可能**: まず高優先度 7 本を追加し、動作確認してから中優先度に進める。リスクが小さい

5. **MCP は不要**: EDINET DB MCP の 15 ツールのうち、既存にない高付加価値の機能は `get_earnings_calendar` と `get_ranking` の 2 本だけ。それすら REST API で直接叩ける。MCP 接続のオーバーヘッドに見合わない

### 推奨する実装順序

**Phase 1 (高優先度、Session 5b)**
1. `get_company_history` — 当初の動機。沿革データ
2. `get_ranking` — 指標別ランキング
3. `get_earnings_calendar` — 決算発表スケジュール

**Phase 2 (高優先度、Session 5c)**
4. `get_segments` — セグメント別業績
5. `get_peer_comparison` — 同業比較
6. `get_financial_trajectory` — CAGR + トレンド分析
7. `get_red_flags` — 財務レッドフラグ

**Phase 3 (中優先度、必要に応じて)**
8. `get_detailed_expenses` — 販管費内訳
9. `get_events` — 企業イベントフィード
10. `get_directors` — 役員一覧

### ツール数増加への対策

ツール数が 17 → 24-27 になることへの対策として、メタツールパターンの拡張を検討:

- **案 A**: 新ツールを個別ツールとして追加 (シンプル。エージェント LLM の選択に任せる)
- **案 B**: 一部を既存メタツール (get_financials, read_filings) のサブツールに組み込む
  - 例: `get_segments` → get_financials のサブツールに追加
  - 例: `get_red_flags` → get_financials のサブツールに追加
- **推奨**: Phase 1 は案 A で個別追加、Phase 2 で使用パターンを見てメタツール統合を判断

---

## 注意: MCP ≠ API

この調査で明確になった重要な事実:

- **EDINET DB MCP (15 ツール)** は REST API (60+ エンドポイント) のサブセットにすぎない
- MCP は Claude.ai / ChatGPT 等の汎用 AI からの簡易アクセス用途
- Dexter JP のような専用エージェントは REST API を直接叩く方が機能も柔軟性も上
- 「MCP 統合」ではなく「REST API の追加エンドポイント活用」が正しいフレーミング
