// Parses a free-form Viber message into a structured action using Claude's
// tool-use, with tool_choice forced so the response is always this exact
// shape — never freeform prose that would need its own ad-hoc parsing.
// Plain fetch (no @anthropic-ai/sdk dependency), matching the rest of this
// Worker's "no SDK, minimal deps" convention (see stripe.js).
const TOOL = {
  name: 'handle_message',
  description: "Interpret what the user wants to do with their personal expense/income tracker, from a chat message.",
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add_expense', 'add_income', 'delete', 'report', 'unknown'],
        description: '"unknown" for greetings, unrelated chat, or anything not clearly one of the others.',
      },
      amount: { type: 'number', description: 'For add_expense/add_income — always positive.' },
      currency: { type: 'string', description: '3-letter code; omit to use the account default.' },
      description: { type: 'string', description: 'What the expense/income was for, in a few words.' },
      category_id: { type: 'string', description: 'Best-matching id from the provided category list; omit if nothing fits well.' },
      date: { type: 'string', description: 'YYYY-MM-DD; omit to mean today.' },
      delete_hint: { type: 'string', description: 'For delete: words to match against a recent entry\'s description; omit to mean "the most recent one".' },
      report_from: { type: 'string', description: 'YYYY-MM-DD, start of the range for a report; omit with report_to to mean "this month".' },
      report_to: { type: 'string', description: 'YYYY-MM-DD, end of the range for a report.' },
      report_category_id: { type: 'string', description: 'Limit the report to one category id; omit for everything.' },
    },
    required: ['action'],
  },
};

export async function parseMessage(env, { text, today, defaultCurrency, categories }) {
  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join('\n') || '(none yet)';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: `Today is ${today}. The account's default currency is ${defaultCurrency}. Available categories (id: name):\n${categoryList}\n\nInterpret the user's message and call handle_message with the single best-fitting action.`,
      messages: [{ role: 'user', content: text }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'handle_message' },
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content?.find((b) => b.type === 'tool_use');
  return toolUse?.input || { action: 'unknown' };
}
