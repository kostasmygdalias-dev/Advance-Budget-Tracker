import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Crown, Repeat, MessageCircle, Bell } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { useLanguage } from '@/lib/i18n';
import PageSkeleton from '@/components/PageSkeleton';

const FEATURES = [
  { icon: Repeat, titleKey: 'upgrade.recurringTitle', bodyKey: 'upgrade.recurringBody' },
  { icon: MessageCircle, titleKey: 'upgrade.viberTitle', bodyKey: 'upgrade.viberBody' },
  { icon: Bell, titleKey: 'upgrade.remindersTitle', bodyKey: 'upgrade.remindersBody' },
];

export default function Upgrade() {
  const { t } = useLanguage();
  const { active: subActive, loading: subLoading, upgradeUrl } = useSubscription();

  if (subLoading) return <PageSkeleton rows={3} />;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mx-auto">
          <Crown className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('upgrade.title')}</h1>
        <p className="text-muted-foreground">{t('upgrade.subtitle')}</p>
      </div>

      {subActive ? (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm font-medium">{t('upgrade.alreadyPro')}</p>
          <Link to="/settings">
            <Button variant="outline">{t('upgrade.manageInSettings')}</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Card key={i} className="p-5 space-y-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="font-medium text-sm">{t(f.titleKey)}</p>
                <p className="text-xs text-muted-foreground">{t(f.bodyKey)}</p>
              </Card>
            ))}
          </div>

          <Card className="p-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{t('upgrade.pitch')}</p>
            {upgradeUrl ? (
              <Button size="lg" className="w-full sm:w-auto" onClick={() => { window.location.href = upgradeUrl; }}>
                {t('upgrade.cta')}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t('upgradePrompt.notAvailable')}</p>
            )}
            <p className="text-xs text-muted-foreground">{t('upgrade.cancelAnytime')}</p>
          </Card>
        </>
      )}
    </div>
  );
}
