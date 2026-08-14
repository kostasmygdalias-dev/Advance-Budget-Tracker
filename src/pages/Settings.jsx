import { useEffect, useState } from 'react';
import { entities } from '@/lib/sheetsStore';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Save, Download, CheckCircle2 } from 'lucide-react';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [sets, cats] = await Promise.all([
          entities.Settings.list(),
          entities.Category.list(),
        ]);
        const existing = sets[0];
        if (existing) {
          setSettings(existing);
        } else {
          const created = await entities.Settings.create({
            default_currency: 'EUR',
            monthly_budget_total: null,
            budget_per_category: {},
          });
          setSettings(created);
        }
        setCategories(cats);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const updateBudget = (catId, v) =>
    setSettings((s) => ({
      ...s,
      budget_per_category: { ...(s.budget_per_category || {}), [catId]: v === '' ? null : parseFloat(v) },
    }));

  const save = async () => {
    setSaving(true);
    try {
      await entities.Settings.update(settings.id, {
        default_currency: settings.default_currency,
        monthly_budget_total: settings.monthly_budget_total || null,
        budget_per_category: settings.budget_per_category || {},
      });
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    const [exp, inc, cats, templates] = await Promise.all([
      entities.Expense.list('-paid_date', 2000),
      entities.Income.list('-received_date', 2000),
      entities.Category.list(),
      entities.RecurringTemplate.list(),
    ]);
    const blob = new Blob([JSON.stringify({ expenses: exp, incomes: inc, categories: cats, recurring_templates: templates, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (loading || !settings) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>

      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-5 h-5" />
          <p className="text-sm font-medium">Signed in as {user?.email}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          All your data — expenses, categories, recurring templates, and these settings —
          lives in a spreadsheet named "ExpenseTrack Data" in your own Google Drive.
          Nobody else, including this app, keeps a separate copy.
        </p>
      </Card>

      <Card className="p-5 space-y-4">
        <p className="text-sm font-medium">Preferences</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default currency</Label>
            <Select value={settings.default_currency} onValueChange={(v) => update('default_currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">Monthly budget total</Label>
            <Input
              id="budget"
              type="number"
              step="0.01"
              value={settings.monthly_budget_total ?? ''}
              onChange={(e) => update('monthly_budget_total', e.target.value === '' ? null : parseFloat(e.target.value))}
              placeholder="Optional"
            />
          </div>
        </div>
      </Card>

      {categories.length > 0 && (
        <Card className="p-5 space-y-4">
          <p className="text-sm font-medium">Budget per category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((c) => (
              <div key={c.id} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: c.color || '#94a3b8' }} />
                  {c.name}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.budget_per_category?.[c.id] ?? ''}
                  onChange={(e) => updateBudget(c.id, e.target.value)}
                  placeholder="Optional"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <Button variant="outline" onClick={exportData}>
          <Download className="w-4 h-4 mr-1" /> Export data (JSON)
        </Button>
      </div>
    </div>
  );
}
