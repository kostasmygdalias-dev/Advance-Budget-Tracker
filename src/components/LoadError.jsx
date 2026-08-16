import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function LoadError({ error, onRetry }) {
  const { t } = useLanguage();
  return (
    <Card className="p-6 text-center space-y-3">
      <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
      <p className="text-sm font-medium">{t('loadError.title')}</p>
      <p className="text-sm text-muted-foreground">
        {error?.message || t('loadError.fallback')}
      </p>
      {onRetry && <Button variant="outline" onClick={onRetry}>{t('loadError.tryAgain')}</Button>}
    </Card>
  );
}
