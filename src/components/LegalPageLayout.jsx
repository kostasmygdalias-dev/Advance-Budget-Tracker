import { Link } from 'react-router-dom';
import { Wallet, ArrowLeft } from 'lucide-react';

// Shared chrome for Privacy/Terms — public pages (outside ProtectedRoute in
// App.jsx), reachable without signing in, since Google's OAuth review and
// prospective users both need to read these without an account.
export default function LegalPageLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary shrink-0">
            <Wallet className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>
        <div className="prose-legal space-y-6 text-sm leading-relaxed text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
