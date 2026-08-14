import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const { login, isAuthenticated, isLoadingAuth, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(location.state?.from?.pathname || "/", { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  return (
    <AuthLayout icon={Wallet} title="ExpenseTrack" subtitle="Sign in with Google to continue">
      {authError && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {authError.message}
        </div>
      )}
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium"
        onClick={login}
        disabled={isLoadingAuth}
      >
        {isLoadingAuth ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : (
          <GoogleIcon className="w-5 h-5 mr-2" />
        )}
        Continue with Google
      </Button>
      <p className="text-xs text-muted-foreground text-center mt-6">
        Your expenses are stored in a spreadsheet in your own Google Drive —
        nobody else, including this app, keeps a separate copy.
      </p>
    </AuthLayout>
  );
}
