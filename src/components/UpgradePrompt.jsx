import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, Check } from 'lucide-react';

export default function UpgradePrompt({ upgradeUrl }) {
  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mx-auto">
        <Lock className="w-7 h-7 text-primary-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-heading font-semibold tracking-tight">Recurring is a Pro feature</h2>
        <p className="text-muted-foreground">
          Set up templates for salary, rent, subscriptions, and anything else that repeats — generate a new entry in one click whenever it's due.
        </p>
      </div>
      <Card className="p-5 text-left space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Unlimited recurring expense & income templates
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> One-click generation, auto-advancing due dates
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Cancel anytime
        </div>
      </Card>
      {upgradeUrl ? (
        <Button size="lg" className="w-full" onClick={() => { window.location.href = upgradeUrl; }}>
          Upgrade to Pro
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Upgrades aren't available yet — check back soon.</p>
      )}
    </div>
  );
}
