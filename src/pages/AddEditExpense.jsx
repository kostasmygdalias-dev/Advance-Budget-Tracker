import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ExpenseForm from '@/components/ExpenseForm';
import { entities } from '@/lib/sheetsStore';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

export default function AddEditExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/transactions?type=expense">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {id ? 'Edit expense' : 'Add expense'}
        </h1>
      </div>
      <ExpenseForm
        initialExpense={expense}
        onSaved={() => navigate('/transactions?type=expense')}
        onCancel={() => navigate('/transactions?type=expense')}
      />
    </div>
  );
}
