import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { api } from './api.js';
import { formatToolResult } from '../types.js';
import { TTL_1H } from './utils.js';

const CalendarInputSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Start date (YYYY-MM-DD). If omitted, defaults to today."),
  to: z
    .string()
    .optional()
    .describe("End date (YYYY-MM-DD). If omitted, defaults to 2 weeks from start."),
  code: z
    .string()
    .optional()
    .describe("Securities code (e.g. '7203') to check a specific company's earnings date."),
  market: z
    .enum(['prime', 'standard', 'growth'])
    .optional()
    .describe('Filter by TSE market segment.'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of results (default: 100, max: 2000).'),
});

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

export const calendarTool = new DynamicStructuredTool({
  name: 'get_earnings_calendar',
  description: `Retrieves the JPX earnings announcement schedule for Japanese listed companies. Shows upcoming earnings disclosure dates. Filter by date range, securities code, or market segment (Prime/Standard/Growth).`,
  schema: CalendarInputSchema,
  func: async (input) => {
    const params: Record<string, string | number | undefined> = {};
    if (input.from) params.from = input.from;
    if (input.to) params.to = input.to;
    if (input.code) params.code = input.code;
    if (input.market) params.market = input.market;
    if (input.limit) params.limit = input.limit;
    const { data: response, url } = await api.get('/calendar', params, { cacheable: true, ttlMs: TTL_1H });
    return formatToolResult(response.data || response, [url]);
  },
});
