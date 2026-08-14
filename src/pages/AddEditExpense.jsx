import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ExpenseForm from '@/components/ExpenseForm';
import { expenseSheet, NotConnectedError } from '@/lib/expenseSheet';
import GoogleSheetsNotConnected from '@/components/GoogleSheetsNotConnected';

export default function AddEditExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [notConnected, setNotConnected] = useState(false);

  useEffect(() => {
    if (!id) return;
    expenseSheet.get(id)
      .then((e) => setExpense(e))
      .catch((err) => {
        if (err instanceof NotConnectedError) setNotConnected(true);
        else throw err;
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (notConnected) return <GoogleSheetsNotConnected />;

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