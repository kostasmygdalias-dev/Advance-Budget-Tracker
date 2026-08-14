import { useMemo } from 'react';
import { calculateAmortizationSchedule, averageMonthlyCost, monthLabel } from '../../base44/shared/finance';

export default function AmortizationPreview({ amount, periodValue, periodUnit, paidDate, currency = 'EUR' }) {
  const schedule = useMemo(
    () => calculateAmortizationSchedule(paidDate, periodValue, periodUnit, amount),
    [paidDate, periodValue, periodUnit, amount]
  );
  const avg = averageMonthlyCost(amount, periodValue, periodUnit);

  if (!schedule.length) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Average monthly cost</span>
        <span className="font-semibold tabular-nums">
          {avg.toFixed(2)} {currency}
        </span>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Month-by-month breakdown
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {schedule.map((s) => (
            <div
              key={s.month}
              className="flex justify-between rounded-lg bg-background px-3 py-2 border text-sm"
            >
              <span className="text-muted-foreground">{monthLabel(s.month)}</span>
              <span className="font-medium tabular-nums">{s.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}