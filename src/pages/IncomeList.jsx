import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil } from 'lucide-react';
import { INCOME_SOURCES } from '@/components/IncomeForm';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

export default function IncomeList() {
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filters, setFilters] = useState({ search: '', source: 'all', from: '', to: '' });

  const load = () => {
    setLoading(true);
    setLoadError(null);
    entities.Income.list('-received_date', 500)
      .then(setIncomes)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return incomes.filter((i) => {
      if (filters.search && !(i.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.source !== 'all' && i.source !== filters.source) return false;
      if (filters.from && i.received_date < filters.from) return false;
      if (filters.to && i.received_date > filters.to) return false;
      return true;
    });
  }, [incomes, filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Income</h1>
        <Link to="/income/new">
          <Button><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </Link>
      </div>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search description"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Select value={filters.source} onValueChange={(v) => set('source', v)}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {INCOME_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          <Input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No income entries match your filters.</p>
        )}
        {filtered.map((i) => (
          <Card key={i.id} className="p-0 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{i.description}</p>
                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {INCOME_SOURCES.find((s) => s.value === i.source)?.label || i.source}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {i.received_date}
                  {(i.tags || []).length > 0 && ` · ${i.tags.join(', ')}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums text-emerald-600">+{fmt(i.amount, i.currency)}</p>
              </div>
              <Link to={`/income/${i.id}/edit`}>
                <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
