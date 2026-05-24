import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { api } from './api.js';
import { formatToolResult } from '../types.js';
import { TTL_1H } from './utils.js';

const RankingInputSchema = z.object({
  metric: z
    .enum([
      'roe', 'operating-margin', 'net-margin', 'roa', 'equity-ratio',
      'per', 'eps', 'dividend-yield', 'payout-ratio', 'revenue',
      'health-score', 'revenue-growth', 'ni-growth', 'eps-growth',
      'revenue-cagr-3y', 'oi-cagr-3y', 'ni-cagr-3y', 'eps-cagr-3y',
    ])
    .describe('Financial metric to rank companies by.'),
  limit: z
    .number()
    .optional()
    .describe('Number of top companies to return (default: 20).'),
});

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

- Returns companies ranked by the specified metric
- Supported metrics: ROE, operating margin, net margin, ROA, equity ratio, PER, EPS, dividend yield, payout ratio, revenue, health score, revenue/NI/EPS growth, 3Y CAGRs
- Use limit to control the number of results
`.trim();

export const rankingTool = new DynamicStructuredTool({
  name: 'get_ranking',
  description: `Retrieves financial metric rankings for all Japanese listed companies. Specify a metric (e.g., roe, dividend-yield, revenue-cagr-3y) to get the top companies ranked by that metric.`,
  schema: RankingInputSchema,
  func: async (input) => {
    const params: Record<string, string | number | undefined> = {};
    if (input.limit) params.limit = input.limit;
    const { data: response, url } = await api.get(`/rankings/${input.metric}`, params, { cacheable: true, ttlMs: TTL_1H });
    return formatToolResult(response.data || response, [url]);
  },
});
