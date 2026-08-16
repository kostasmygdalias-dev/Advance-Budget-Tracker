import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ExpenseForm from '@/components/ExpenseForm';
import { entities } from '@/lib/sheetsStore';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

export default function AddEditExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    entities.Expense.get(id)
      .then((e) => setExpense(e))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <PageSkeleton rows={2} />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  // month=all, not the default current-month view: this expense's date might
  // not be in the current month (editing an old entry), and Transactions
  // would otherwise default to a month that hides what was just saved.
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/transactions?type=expense&month=all">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {id ? t('addEditExpense.editTitle') : t('addEditExpense.addTitle')}
        </h1>
      </div>
      <ExpenseForm
        initialExpense={expense}
        onSaved={() => navigate('/transactions?type=expense&month=all')}
        onCancel={() => navigate('/transactions?type=expense&month=all')}
      />
    </div>
  );
}
