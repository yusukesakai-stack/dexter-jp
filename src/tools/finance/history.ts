import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { api } from './api.js';
import { resolveEdinetCode } from './resolver.js';
import { formatToolResult } from '../types.js';

const HistoryInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "Securities code (e.g. '7203' for Toyota) or EDINET code (e.g. 'E02144'). Company names also work (e.g. 'トヨタ', 'Sony')."
    ),
  from_year: z
    .number()
    .optional()
    .describe('Start year for filtering events (e.g. 2000). If omitted, returns all available history.'),
  to_year: z
    .number()
    .optional()
    .describe('End year for filtering events (e.g. 2025). If omitted, returns up to the latest.'),
  event_type: z
    .string()
    .optional()
    .describe(
      'Filter by event type. Comma-separated values from: founding, listing, delisting, renaming, merger, acquisition, divestiture, subsidiary_change, business_change, facility, management, other.'
    ),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of events to return (default: 200, max: 1000).'),
});

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

export const historyTool = new DynamicStructuredTool({
  name: 'get_company_history',
  description: `Retrieves the corporate history timeline for a Japanese listed company. Returns founding, listing, M&A, name changes, subsidiary changes, and other milestones as chronological events.`,
  schema: HistoryInputSchema,
  func: async (input) => {
    const edinetCode = await resolveEdinetCode(input.ticker);
    const params: Record<string, string | number | undefined> = {};
    if (input.from_year) params.from_year = input.from_year;
    if (input.to_year) params.to_year = input.to_year;
    if (input.event_type) params.event_type = input.event_type;
    if (input.limit) params.limit = input.limit;
    // History data is immutable once filed
    const { data: response, url } = await api.get(`/companies/${edinetCode}/history`, params, { cacheable: true });
    return formatToolResult(response.data || response, [url]);
  },
});
