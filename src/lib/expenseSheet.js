// Drop-in replacement for `base44.entities.Expense` that stores expenses in
// the current user's own Google Sheet instead of Base44's shared database —
// see base44/functions/expenses-sheet/entry.js for the storage side.
import { base44 } from '@/api/base44Client';

export class NotConnectedError extends Error {
  constructor() {
    super('Google Sheets is not connected for this user.');
    this.name = 'NotConnectedError';
  }
}

async function call(action, payload = {}) {
  try {
    const res = await base44.functions.invoke('expenses-sheet', { action, ...payload });
    return res.data;
  } catch (err) {
    if (err.response?.status === 412) throw new NotConnectedError();
    throw new Error(err.response?.data?.error || err.message);
  }
}

function sortBy(list, sort) {
  if (!sort) return list;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return [...list].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

export const expenseSheet = {
  async list(sort, limit) {
    const { expenses } = await call('list');
    const sorted = sortBy(expenses, sort);
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  },
  async get(id) {
    const { expense } = await call('get', { id });
    return expense;
  },
  async create(data) {
    const { expense } = await call('create', { data });
    return expense;
  },
  async update(id, data) {
    const { expense } = await call('update', { id, data });
    return expense;
  },
  async delete(id) {
    await call('delete', { id });
  },
};
