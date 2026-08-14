import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ExpenseForm from '@/components/ExpenseForm';
import { entities } from '@/lib/sheetsStore';

export default function AddEditExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    entities.Expense.get(id)
      .then((e) => setExpense(e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/expenses">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {id ? 'Edit expense' : 'Add expense'}
        </h1>
      </div>
      <ExpenseForm
        initialExpense={expense}
        onSaved={() => navigate('/expenses')}
        onCancel={() => navigate('/expenses')}
      />
    </div>
  );
}
