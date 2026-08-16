import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Save, Download, Upload, CheckCircle2, Crown, FolderTree } from 'lucide-react';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useSubscription } from '@/hooks/use-subscription';
import { openBillingPortal } from '@/lib/subscription';
import { parseCsv } from '@/lib/csv';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { active: subActive, loading: subLoading, configured: billingConfigured, upgradeUrl } = useSubscription();
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [importType, setImportType] = useState('expense');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const manageSubscription = async () => {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast({ title: 'Could not open billing portal', description: err.message, variant: 'destructive' });
      setPortalLoading(false);
    }
  };

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
        budget_period: settings.budget_period || 'monthly',
      });
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (file) => {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const currency = settings.default_currency || 'EUR';
      let imported = 0;
      let skipped = 0;

      for (const row of rows) {
        const date = row.date || row['transaction date'] || '';
        const description = row.description || row.memo || row.payee || '';
        const amount = Math.abs(parseFloat(row.amount ?? ''));
        const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
        if (!isValidDate || !description || !amount || Number.isNaN(amount)) {
          skipped++;
          continue;
        }
        try {
          if (importType === 'income') {
            await entities.Income.create({
              description, amount, currency, received_date: date, source: 'other',
            });
          } else {
            const categoryName = (row.category || '').trim().toLowerCase();
            const matched = categoryName ? categories.find((c) => c.name.toLowerCase() === categoryName) : null;
            await entities.Expense.create({
              description, amount, currency, paid_date: date,
              category_id: matched?.id || null, payment_method: 'other',
              expense_type: 'single', amortization_schedule: [],
            });
          }
          imported++;
        } catch {
          skipped++;
        }
      }

      toast({
        title: `Imported ${imported} transaction${imported === 1 ? '' : 's'}`,
        description: skipped > 0 ? `${skipped} row${skipped === 1 ? '' : 's'} skipped — missing or invalid date, description, or amount.` : undefined,
      });
    } catch (err) {
      toast({ title: 'Could not read file', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

      {billingConfigured && !subLoading && (
        <Card className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${subActive ? 'bg-primary' : 'bg-muted'}`}>
              <Crown className={`w-5 h-5 ${subActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{subActive ? 'Pro plan' : 'Free plan'}</p>
              <p className="text-xs text-muted-foreground">
                {subActive ? 'Recurring templates unlocked' : 'Upgrade to unlock recurring expense & income templates'}
              </p>
            </div>
          </div>
          {subActive ? (
            <Button variant="outline" onClick={manageSubscription} disabled={portalLoading}>
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </Button>
          ) : (
            upgradeUrl && <Button onClick={() => { window.location.href = upgradeUrl; }}>Upgrade to Pro</Button>
          )}
        </Card>
      )}

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
            <Label>Budget period</Label>
            <Select value={settings.budget_period || 'monthly'} onValueChange={(v) => update('budget_period', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">{(settings.budget_period || 'monthly') === 'weekly' ? 'Weekly' : 'Monthly'} budget total</Label>
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

      <Card className="p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">Import transactions (CSV)</p>
          <p className="text-xs text-muted-foreground mt-1">
            Needs <code>date</code> (YYYY-MM-DD), <code>description</code>, and <code>amount</code> columns. An
            optional <code>category</code> column is matched by name against your existing categories.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={importType} onValueChange={setImportType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-1" /> {importing ? 'Importing…' : 'Choose CSV file'}
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <Button variant="outline" onClick={exportData}>
          <Download className="w-4 h-4 mr-1" /> Export data (JSON)
        </Button>
        <Link to="/categories">
          <Button variant="outline">
            <FolderTree className="w-4 h-4 mr-1" /> Manage categories
          </Button>
        </Link>
      </div>
    </div>
  );
}
