import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function LoadError({ error, onRetry }) {
  return (
    <Card className="p-6 text-center space-y-3">
      <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
      <p className="text-sm font-medium">Couldn't load your data</p>
      <p className="text-sm text-muted-foreground">
        {error?.message || 'Something went wrong talking to Google.'}
      </p>
      {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}
