import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import {
  requestAccessToken, fetchUserInfo, revokeAccessToken,
  hasAccessToken, getAccessToken, getProfileHint, setProfileHint,
} from '@/lib/googleAuth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const applySession = useCallback(async (token) => {
    const profile = await fetchUserInfo(token);
    setUser(profile);
    setProfileHint(profile);
    setIsAuthenticated(true);
    return profile;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (hasAccessToken()) {
          await applySession(getAccessToken());
        } else if (getProfileHint()) {
          // Previously signed in this browser — try a silent refresh before
          // asking the user to click through the consent popup again.
          await requestAccessToken({ silent: true });
          await applySession(getAccessToken());
        }
      } catch {
        // No active Google session to silently resume from; user must sign in.
      } finally {
        setIsLoadingAuth(false);
      }
    })();
  }, [applySession]);

  const login = async () => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      await requestAccessToken({ silent: false });
      await applySession(getAccessToken());
    } catch (err) {
      setAuthError({ message: err.message || 'Google sign-in failed.' });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    await revokeAccessToken();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, authError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
