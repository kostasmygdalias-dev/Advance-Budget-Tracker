import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { entities, createBackupSnapshot, listBackupSnapshots, getBackupSnapshotJson } from '@/lib/sheetsStore';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Save, Download, Upload, CheckCircle2, Crown, FolderTree, BarChart3, Wallet, History } from 'lucide-react';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useSubscription } from '@/hooks/use-subscription';
import { openBillingPortal } from '@/lib/subscription';
import { parseCsv } from '@/lib/csv';
import { downloadJson } from '@/lib/exportFile';
import { useInvalidateSettings } from '@/hooks/useEntities';
import { useLanguage, LANGUAGES } from '@/lib/i18n';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, lang, setLang } = useLanguage();
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
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const invalidateSettings = useInvalidateSettings();

  const loadBackups = () => {
    setBackupsLoading(true);
    listBackupSnapshots()
      .then(setBackups)
      .catch(() => {}) // non-critical — the rest of Settings still works if this fails
      .finally(() => setBackupsLoading(false));
  };

  useEffect(loadBackups, []);

  const backupNow = async () => {
    setBackingUp(true);
    try {
      await createBackupSnapshot();
      toast({ title: t('settings.backupCreated') });
      loadBackups();
    } catch (err) {
      toast({ title: t('settings.couldNotBackup'), description: err.message, variant: 'destructive' });
    } finally {
      setBackingUp(false);
    }
  };

  const downloadBackup = async (id, created_date) => {
    setDownloadingId(id);
    try {
      const json = await getBackupSnapshotJson(id);
      downloadJson(`expensetrack-backup-${created_date.slice(0, 10)}.json`, json);
    } catch (err) {
      toast({ title: t('settings.couldNotDownloadBackup'), description: err.message, variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

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
          invalidateSettings();
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

  const save = async () => {
    setSaving(true);
    try {
      await entities.Settings.update(settings.id, {
        default_currency: settings.default_currency,
        budget_period: settings.budget_period || 'monthly',
      });
      invalidateSettings();
      toast({ title: t('settings.settingsSaved') });
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
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
        title: imported === 1 ? t('settings.importedTransactionsOne', { count: imported }) : t('settings.importedTransactionsOther', { count: imported }),
        description: skipped > 0 ? (skipped === 1 ? t('settings.rowsSkippedOne', { count: skipped }) : t('settings.rowsSkippedOther', { count: skipped })) : undefined,
      });
    } catch (err) {
      toast({ title: t('settings.couldNotReadFile'), description: err.message, variant: 'destructive' });
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
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('settings.title')}</h1>

      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-5 h-5" />
          <p className="text-sm font-medium">{t('settings.signedInAs', { email: user?.email })}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('settings.dataNotice')}
        </p>
      </Card>

      {billingConfigured && !subLoading && (
        <Card className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${subActive ? 'bg-primary' : 'bg-muted'}`}>
              <Crown className={`w-5 h-5 ${subActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{subActive ? t('settings.proPlan') : t('settings.freePlan')}</p>
              <p className="text-xs text-muted-foreground">
                {subActive ? t('settings.recurringUnlocked') : t('settings.recurringLocked')}
              </p>
            </div>
          </div>
          {subActive ? (
            <Button variant="outline" onClick={manageSubscription} disabled={portalLoading}>
              {portalLoading ? t('settings.opening') : t('settings.manageSubscription')}
            </Button>
          ) : (
            upgradeUrl && <Button onClick={() => { window.location.href = upgradeUrl; }}>{t('settings.upgradeToPro')}</Button>
          )}
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <p className="text-sm font-medium">{t('settings.preferences')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{t('settings.defaultCurrency')}</Label>
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
            <Label>{t('settings.budgetPeriod')}</Label>
            <Select value={settings.budget_period || 'monthly'} onValueChange={(v) => update('budget_period', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('settings.monthly')}</SelectItem>
                <SelectItem value="weekly">{t('settings.weekly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.language')}</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">{t('settings.importTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.importDescription')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={importType} onValueChange={setImportType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">{t('transactions.tabExpenses')}</SelectItem>
              <SelectItem value="income">{t('common.income')}</SelectItem>
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
            <Upload className="w-4 h-4 mr-1" /> {importing ? t('settings.importing') : t('settings.chooseCsvFile')}
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">{t('settings.backupsTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.backupsDescription')}</p>
        </div>
        <Button variant="outline" onClick={backupNow} disabled={backingUp}>
          <History className="w-4 h-4 mr-1" /> {backingUp ? t('settings.backingUp') : t('settings.backupNow')}
        </Button>
        {!backupsLoading && (
          backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.noBackupsYet')}</p>
          ) : (
            <div className="space-y-1.5">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0">
                  <span className="tabular-nums">{new Date(b.created_date).toLocaleString(lang === 'el' ? 'el-GR' : undefined)}</span>
                  <Button variant="ghost" size="sm" onClick={() => downloadBackup(b.id, b.created_date)} disabled={downloadingId === b.id}>
                    <Download className="w-3.5 h-3.5 mr-1" /> {t('settings.downloadBackup')}
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? t('common.saving') : t('settings.saveSettings')}
        </Button>
        <Button variant="outline" onClick={exportData}>
          <Download className="w-4 h-4 mr-1" /> {t('settings.exportData')}
        </Button>
        <Link to="/categories">
          <Button variant="outline">
            <FolderTree className="w-4 h-4 mr-1" /> {t('settings.manageCategories')}
          </Button>
        </Link>
        <Link to="/budgets">
          <Button variant="outline">
            <Wallet className="w-4 h-4 mr-1" /> {t('settings.manageBudgets')}
          </Button>
        </Link>
        <Link to="/reports">
          <Button variant="outline">
            <BarChart3 className="w-4 h-4 mr-1" /> {t('settings.viewReports')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
