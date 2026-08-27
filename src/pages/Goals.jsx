import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { differenceInCalendarMonths } from 'date-fns';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { parseDateLocal, fmt, CURRENCIES } from '@/lib/finance';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export default function Goals() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'debts' ? 'debts' : 'goals';
  const [tab, setTab] = useState(initialTab);

  const [goals, setGoals] = useState([]);
  const [debts, setDebts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
  const [editingDebt, setEditingDebt] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [g, d, sets] = await Promise.all([
          entities.Goal.list('-created_date'),
          entities.Debt.list('-created_date'),
          entities.Settings.list(),
        ]);
        setGoals(g);
        setDebts(d);
        setSettings(sets[0] || null);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  const changeTab = (t) => {
    setTab(t);
    setSearchParams(t === 'goals' ? {} : { tab: t }, { replace: true });
  };

  const currency = settings?.default_currency || 'EUR';

  const openNewGoal = () => setEditingGoal({ name: '', target_amount: '', saved_amount: '0', currency, deadline: '' });
  const openEditGoal = (g) => setEditingGoal({
    ...g, target_amount: String(g.target_amount), saved_amount: String(g.saved_amount), deadline: g.deadline || '',
  });

  const saveGoal = async (e) => {
    e.preventDefault();
    if (!editingGoal.name.trim() || !editingGoal.target_amount) return;
    const payload = {
      name: editingGoal.name.trim(),
      icon: 'Target',
      target_amount: parseFloat(editingGoal.target_amount),
      saved_amount: parseFloat(editingGoal.saved_amount) || 0,
      currency: editingGoal.currency || currency,
      deadline: editingGoal.deadline || null,
    };
    try {
      if (editingGoal.id) await entities.Goal.update(editingGoal.id, payload);
      else await entities.Goal.create(payload);
      setEditingGoal(null);
      load();
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    }
  };

  const openNewDebt = () => setEditingDebt({
    person: '', direction: 'they_owe', total_amount: '', paid_amount: '0', currency,
    start_date: todayStr(), due_date: '', notes: '',
  });
  const openEditDebt = (d) => setEditingDebt({
    ...d, total_amount: String(d.total_amount), paid_amount: String(d.paid_amount), due_date: d.due_date || '', notes: d.notes || '',
  });

  const saveDebt = async (e) => {
    e.preventDefault();
    if (!editingDebt.person.trim() || !editingDebt.total_amount) return;
    const payload = {
      person: editingDebt.person.trim(),
      direction: editingDebt.direction,
      total_amount: parseFloat(editingDebt.total_amount),
      paid_amount: parseFloat(editingDebt.paid_amount) || 0,
      currency: editingDebt.currency || currency,
      start_date: editingDebt.start_date || todayStr(),
      due_date: editingDebt.due_date || null,
      notes: editingDebt.notes || null,
    };
    try {
      if (editingDebt.id) await entities.Debt.update(editingDebt.id, payload);
      else await entities.Debt.create(payload);
      setEditingDebt(null);
      load();
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    }
  };

  const confirmPayment = async () => {
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0 || !paymentTarget) return;
    try {
      if (paymentTarget.kind === 'goal') {
        await entities.Goal.update(paymentTarget.item.id, { saved_amount: paymentTarget.item.saved_amount + amt });
      } else {
        await entities.Debt.update(paymentTarget.item.id, { paid_amount: paymentTarget.item.paid_amount + amt });
      }
      setPaymentTarget(null);
      setPaymentAmount('');
      load();
    } catch (err) {
      toast({ title: t('common.couldNotUpdate'), description: err.message, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      if (target.kind === 'goal') await entities.Goal.delete(target.id);
      else await entities.Debt.delete(target.id);
      load();
    } catch (err) {
      toast({ title: t('common.couldNotDelete'), description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  const netDebts = debts.reduce((s, d) => {
    const residual = d.total_amount - d.paid_amount;
    return s + (d.direction === 'they_owe' ? residual : -residual);
  }, 0);
  const totalGoalsRemaining = goals.reduce((s, g) => s + Math.max(0, g.target_amount - g.saved_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('goals.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('goals.subtitle')}</p>
        </div>
        <Button onClick={tab === 'goals' ? openNewGoal : openNewDebt}>
          <Plus className="w-4 h-4 mr-1" /> {tab === 'goals' ? t('goals.addGoal') : t('goals.addDebt')}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="goals">{t('goals.tabGoals')}</TabsTrigger>
          <TabsTrigger value="debts">{t('goals.tabDebts')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'goals' ? (
        <div className="space-y-4">
          {goals.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">{t('goals.noGoalsYet')}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? Math.min(100, (g.saved_amount / g.target_amount) * 100) : 0;
              const remaining = Math.max(0, g.target_amount - g.saved_amount);
              const monthsLeft = g.deadline ? Math.max(1, differenceInCalendarMonths(parseDateLocal(g.deadline), new Date())) : null;
              const perMonth = monthsLeft ? remaining / monthsLeft : null;
              return (
                <Card key={g.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{g.name}</p>
                      {g.deadline && <p className="text-xs text-muted-foreground">{t('goals.by', { date: g.deadline })}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEditGoal(g)} aria-label={t('goals.editGoalButton', { name: g.name })}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: 'goal', id: g.id, label: `"${g.name}"` })} aria-label={t('goals.deleteGoalButton', { name: g.name })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{fmt(g.saved_amount, g.currency)}</span>
                      <span>{pct.toFixed(0)}%</span>
                      <span>{fmt(g.target_amount, g.currency)}</span>
                    </div>
                  </div>
                  {perMonth != null && remaining > 0 && (
                    <p className="text-xs text-muted-foreground">{t('goals.savePerMonth', { amount: fmt(perMonth, g.currency), date: g.deadline })}</p>
                  )}
                  {remaining > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => { setPaymentTarget({ kind: 'goal', item: g }); setPaymentAmount(''); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> {t('goals.addSavings')}
                    </Button>
                  ) : (
                    <p className="text-xs font-medium text-emerald-600">{t('goals.goalReached')}</p>
                  )}
                </Card>
              );
            })}
          </div>
          {goals.length > 0 && (
            <Card className="p-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('goals.remainingAcrossGoals')}</span>
              <span className="font-semibold tabular-nums">{fmt(totalGoalsRemaining, currency)}</span>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {debts.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">{t('goals.noDebtsYet')}</p>}
          <div className="space-y-2">
            {debts.map((d) => {
              const pct = d.total_amount > 0 ? Math.min(100, (d.paid_amount / d.total_amount) * 100) : 0;
              const residual = d.total_amount - d.paid_amount;
              const theyOwe = d.direction === 'they_owe';
              return (
                <Card key={d.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{theyOwe ? t('goals.theyOweYou', { person: d.person }) : t('goals.youOwe', { person: d.person })}</p>
                      {d.due_date && <p className="text-xs text-muted-foreground">{t('goals.due', { date: d.due_date })}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`font-semibold tabular-nums mr-1 ${theyOwe ? 'text-emerald-600' : 'text-destructive'}`}>
                        {fmt(residual, d.currency)}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => openEditDebt(d)} aria-label={t('goals.editDebtButton', { person: d.person })}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: 'debt', id: d.id, label: d.person })} aria-label={t('goals.deleteDebtButton', { person: d.person })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: theyOwe ? '#10b981' : '#ef4444' }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{t('goals.repaid', { amount: fmt(d.paid_amount, d.currency) })}</span>
                      <span>{pct.toFixed(0)}%</span>
                      <span>{t('goals.total', { amount: fmt(d.total_amount, d.currency) })}</span>
                    </div>
                  </div>
                  {residual > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setPaymentTarget({ kind: 'debt', item: d }); setPaymentAmount(''); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> {t('goals.logRepayment')}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          {debts.length > 0 && (
            <Card className="p-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('goals.netBalance')}</span>
              <span className={`font-semibold tabular-nums ${netDebts >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {netDebts >= 0 ? '+' : ''}{fmt(netDebts, currency)}
              </span>
            </Card>
          )}
        </div>
      )}

      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setEditingGoal(null)}>
          <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">{editingGoal.id ? t('goals.editGoal') : t('goals.newGoal')}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditingGoal(null)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={saveGoal} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="g-name">{t('goals.name')}</Label>
                <Input id="g-name" value={editingGoal.name} onChange={(e) => setEditingGoal({ ...editingGoal, name: e.target.value })} autoFocus placeholder={t('goals.namePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="g-target">{t('goals.targetAmount')}</Label>
                  <Input id="g-target" type="number" step="0.01" value={editingGoal.target_amount} onChange={(e) => setEditingGoal({ ...editingGoal, target_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('common.currency')}</Label>
                  <Select value={editingGoal.currency || currency} onValueChange={(v) => setEditingGoal({ ...editingGoal, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="g-saved">{t('goals.alreadySaved')}</Label>
                  <Input id="g-saved" type="number" step="0.01" value={editingGoal.saved_amount} onChange={(e) => setEditingGoal({ ...editingGoal, saved_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="g-deadline">{t('goals.deadlineOptional')}</Label>
                  <Input id="g-deadline" type="date" value={editingGoal.deadline} onChange={(e) => setEditingGoal({ ...editingGoal, deadline: e.target.value })} />
                </div>
              </div>
              <Button type="submit" className="w-full">{t('common.save')}</Button>
            </form>
          </Card>
        </div>
      )}

      {editingDebt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setEditingDebt(null)}>
          <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">{editingDebt.id ? t('goals.editDebt') : t('goals.newDebt')}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditingDebt(null)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={saveDebt} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('goals.direction')}</Label>
                <Select value={editingDebt.direction} onValueChange={(v) => setEditingDebt({ ...editingDebt, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="they_owe">{t('goals.theyOweMe')}</SelectItem>
                    <SelectItem value="i_owe">{t('goals.iOweThem')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-person">{t('goals.person')}</Label>
                <Input id="d-person" value={editingDebt.person} onChange={(e) => setEditingDebt({ ...editingDebt, person: e.target.value })} autoFocus placeholder={t('goals.personPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="d-total">{t('goals.totalAmount')}</Label>
                  <Input id="d-total" type="number" step="0.01" value={editingDebt.total_amount} onChange={(e) => setEditingDebt({ ...editingDebt, total_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('common.currency')}</Label>
                  <Select value={editingDebt.currency || currency} onValueChange={(v) => setEditingDebt({ ...editingDebt, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="d-paid">{t('goals.alreadyRepaid')}</Label>
                  <Input id="d-paid" type="number" step="0.01" value={editingDebt.paid_amount} onChange={(e) => setEditingDebt({ ...editingDebt, paid_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-due">{t('goals.dueDateOptional')}</Label>
                  <Input id="d-due" type="date" value={editingDebt.due_date} onChange={(e) => setEditingDebt({ ...editingDebt, due_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-notes">{t('goals.notesOptional')}</Label>
                <Input id="d-notes" value={editingDebt.notes} onChange={(e) => setEditingDebt({ ...editingDebt, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">{t('common.save')}</Button>
            </form>
          </Card>
        </div>
      )}

      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setPaymentTarget(null)}>
          <Card className="p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">
                {paymentTarget.kind === 'goal' ? t('goals.addSavings') : t('goals.logARepayment')}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setPaymentTarget(null)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-amount">{t('common.amount')}</Label>
              <Input
                id="pay-amount" type="number" step="0.01" autoFocus
                value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmPayment(); }}
              />
            </div>
            <Button className="w-full" onClick={confirmPayment}>{t('common.add')}</Button>
          </Card>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.kind === 'goal' ? t('goals.deleteGoalTitle') : t('goals.deleteDebtTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('goals.deleteBody', { label: deleteTarget?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: 'destructive' })}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
