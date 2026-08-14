import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HardDrive } from 'lucide-react';

export default function GoogleSheetsNotConnected() {
  return (
    <Card className="p-6 text-center space-y-3">
      <HardDrive className="w-6 h-6 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium">Connect Google Sheets to see your expenses</p>
      <p className="text-sm text-muted-foreground">
        Your expenses are stored in a spreadsheet in your own Google Drive. Connect it once from Settings.
      </p>
      <Link to="/settings">
        <Button variant="outline">Go to Settings</Button>
      </Link>
    </Card>
  );
}
