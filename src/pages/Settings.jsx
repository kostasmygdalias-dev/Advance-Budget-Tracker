import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { expenseSheet, NotConnectedError } from '@/lib/expenseSheet';
import { GOOGLE_SHEETS_CONNECTOR_ID } from '@/lib/googleConnector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Save, Download, HardDrive, HardDriveUpload, CheckCircle2, Loader2 } from 'lucide-react';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(null); // null = checking
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sets, cats] = await Promise.all([
          base44.entities.Settings.list(),
          base44.entities.Category.list(),
        ]);
        const existing = sets[0];
        if (existing) {
          setSettings(existing);
        } else {
          const created = await base44.entities.Settings.create({
            default_currency: 'EUR',
            monthly_budget_total: null,
            budget_per_category: {},
          });
          setSettings(created);
        }
        setCategories(cats);
      } finally {
        setLoading(false);
      }
    })();
    expenseSheet.list(null, 1)
      .then(() => setSheetsConnected(true))
      .catch((err) => setSheetsConnected(!(err instanceof NotConnectedError)));
  }, []);

  const connectGoogleSheets = async () => {
    setConnecting(true);
    try {
      const redirectUrl = await base44.connectors.connectAppUser(GOOGLE_SHEETS_CONNECTOR_ID);
      window.location.href = redirectUrl;
    } catch (err) {
      toast({ title: 'Could not start Google connection', description: err.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const disconnectGoogleSheets = async () => {
    setConnecting(true);
    try {
      await base44.connectors.disconnectAppUser(GOOGLE_SHEETS_CONNECTOR_ID);
      setSheetsConnected(false);
      toast({ title: 'Google Sheets disconnected' });
    } catch (err) {
      toast({ title: 'Could not disconnect', description: err.message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const updateBudget = (catId, v) =>
    setSettings((s) => ({
      ...s,
      budget_per_category: { ...(s.budget_per_category || {}), [catId]: v === '' ? null : parseFloat(v) },
    }));

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Settings.update(settings.id, {
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
    const [exp, cats, templates] = await Promise.all([
      expenseSheet.list('-paid_date', 2000).catch(() => []),
      base44.entities.Category.list(),
      base44.entities.RecurringTemplate.list(),
    ]);
    const blob = new Blob([JSON.stringify({ expenses: exp, categories: cats, recurring_templates: templates, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !settings) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>

      <Card className="p-5 space-y-4">
        <div className={`flex items-center gap-2 ${sheetsConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
          {sheetsConnected ? <CheckCircle2 className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
          <p className="text-sm font-medium">Your expenses in Google Sheets</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {sheetsConnected
            ? 'Your expenses are stored in a spreadsheet in your own Google Drive — nobody else, including this app\'s database, holds a copy.'
            : 'Expenses are stored in a spreadsheet created in your own Google Drive, not in a shared database. Connect your Google account once to get started.'}
        </p>
        {sheetsConnected === null ? (
          <Button variant="outline" disabled>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Checking…
          </Button>
        ) : sheetsConnected ? (
          <Button variant="outline" onClick={disconnectGoogleSheets} disabled={connecting}>
            <HardDriveUpload className="w-4 h-4 mr-1" /> {connecting ? 'Disconnecting…' : 'Disconnect Google Sheets'}
          </Button>
        ) : (
          <Button variant="outline" onClick={connectGoogleSheets} disabled={connecting}>
            <HardDriveUpload className="w-4 h-4 mr-1" /> {connecting ? 'Redirecting…' : 'Connect Google Sheets'}
          </Button>
        )}
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