import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, Check } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

// title/description/features default to the Recurring-specific copy (this
// component's only caller until Insights.jsx), which lets a second Pro-gated
// page pass its own without touching Recurring's behavior at all.
export default function UpgradePrompt({ upgradeUrl, title, description, features }) {
  const { t } = useLanguage();
  const resolvedFeatures = features || [t('upgradePrompt.feature1'), t('upgradePrompt.feature2'), t('upgradePrompt.feature3')];
  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mx-auto">
        <Lock className="w-7 h-7 text-primary-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-heading font-semibold tracking-tight">{title || t('upgradePrompt.title')}</h2>
        <p className="text-muted-foreground">
          {description || t('upgradePrompt.description')}
        </p>
      </div>
      <Card className="p-5 text-left space-y-3">
        {resolvedFeatures.map((feature, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" /> {feature}
          </div>
        ))}
      </Card>
      {upgradeUrl ? (
        <Button size="lg" className="w-full" onClick={() => { window.location.href = upgradeUrl; }}>
          {t('upgradePrompt.upgradeToPro')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('upgradePrompt.notAvailable')}</p>
      )}
      <Link to="/upgrade" className="text-xs text-muted-foreground underline block">{t('upgradePrompt.seeAllBenefits')}</Link>
    </div>
  );
}
