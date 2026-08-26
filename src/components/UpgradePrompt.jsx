import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, Check } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function UpgradePrompt({ upgradeUrl }) {
  const { t } = useLanguage();
  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mx-auto">
        <Lock className="w-7 h-7 text-primary-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-heading font-semibold tracking-tight">{t('upgradePrompt.title')}</h2>
        <p className="text-muted-foreground">
          {t('upgradePrompt.description')}
        </p>
      </div>
      <Card className="p-5 text-left space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> {t('upgradePrompt.feature1')}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> {t('upgradePrompt.feature2')}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" /> {t('upgradePrompt.feature3')}
        </div>
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
