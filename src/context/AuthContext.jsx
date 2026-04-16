import { createContext, useContext, useState, useCallback } from 'react';
import { login as apiLogin, register as apiRegister, registerAsUmpire as apiRegisterUmpire } from '../api/index.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'zvbl_roster_auth';

function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return null;
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiLogin(username, password);
      const saved = {
        token: data.token,
        user: data.user,
        permissions: data.permissions || { org_ids: [], team_ids: [] },
      };
      setAuth(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username, password, name, email) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRegister(username, password, name, email);
      const saved = {
        token: data.token,
        user: data.user,
        permissions: data.permissions || { org_ids: [], team_ids: [] },
      };
      setAuth(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const registerUmpire = useCallback(async (username, password, name, email, phone, org_id, date_of_birth, is_certified, years_of_experience) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRegisterUmpire(username, password, name, email, phone, org_id, date_of_birth, is_certified, years_of_experience);
      const saved = {
        token: data.token,
        user: data.user,
        permissions: data.permissions || { org_ids: [], team_ids: [] },
      };
      setAuth(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const role = auth?.user?.role;
  const isSuperAdmin = role === 'super_admin';
  const isOrgAdmin = role === 'org_admin';
  const isAccountant = role === 'accountant';
  const isAdmin = isSuperAdmin; // backward compat
  const isUmpire = role === 'umpire' || auth?.user?.is_umpire === true;
  const permissions = auth?.permissions || { org_ids: [], team_ids: [] };

  const canEditOrg = useCallback((orgId) => {
    if (isSuperAdmin) return true;
    if (role === 'score_reporter') return false;
    if (isAccountant) return true;
    if (permissions.org_ids.includes(Number(orgId))) return true;
    if (permissions.team_org_ids?.includes(Number(orgId))) return true;
    return false;
  }, [isSuperAdmin, isAccountant, role, permissions.org_ids, permissions.team_org_ids]);

  const canEditTeam = useCallback((teamId, orgId) => {
    if (isSuperAdmin) return true;
    if (role === 'score_reporter') return false;
    if (permissions.team_ids.includes(Number(teamId))) return true;
    if (orgId && permissions.org_ids.includes(Number(orgId))) return true;
    return false;
  }, [isSuperAdmin, role, permissions.org_ids, permissions.team_ids]);

  const canScoreGame = useCallback((homeTeamId, awayTeamId, homeOrgId, awayOrgId) => {
    if (isSuperAdmin) return true;
    const teamIds = [Number(homeTeamId), Number(awayTeamId)];
    if (teamIds.some(id => permissions.team_ids.includes(id))) return true;
    const orgIds = [homeOrgId, awayOrgId].filter(Boolean).map(Number);
    if (orgIds.some(id => permissions.org_ids.includes(id))) return true;
    return false;
  }, [isSuperAdmin, permissions.org_ids, permissions.team_ids]);

  const canScheduleGames = isSuperAdmin || isOrgAdmin;

  const canDeleteGame = useCallback((homeTeamId, awayTeamId, homeOrgId, awayOrgId) => {
    if (isSuperAdmin) return true;
    if (!isOrgAdmin) return false;
    const orgIds = [homeOrgId, awayOrgId].filter(Boolean).map(Number);
    return orgIds.length > 0 && orgIds.every(id => permissions.org_ids.includes(id));
  }, [isSuperAdmin, isOrgAdmin, permissions.org_ids]);

  const value = {
    token: auth?.token,
    user: auth?.user,
    isAuthenticated: !!auth?.token,
    isAdmin,
    isSuperAdmin,
    isOrgAdmin,
    isAccountant,
    isUmpire,
    role,
    permissions,
    canEditOrg,
    canEditTeam,
    canScoreGame,
    canScheduleGames,
    canDeleteGame,
    loading,
    error,
    login,
    register,
    registerUmpire,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
