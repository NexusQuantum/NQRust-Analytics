import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';

// GraphQL queries and mutations
const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      displayName
      avatarUrl
      isActive
      isVerified
      roles {
        id
        name
        permissions {
          id
          name
          resource
          action
        }
      }
    }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($data: LoginInput!) {
    login(data: $data) {
      user {
        id
        email
        displayName
        avatarUrl
        roles {
          id
          name
        }
      }
      accessToken
      refreshToken
    }
  }
`;

const REGISTER_MUTATION = gql`
  mutation Register($data: RegisterInput!) {
    register(data: $data) {
      user {
        id
        email
        displayName
      }
      accessToken
      refreshToken
    }
  }
`;

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      user {
        id
        email
        displayName
        roles {
          id
          name
        }
      }
      accessToken
      refreshToken
    }
  }
`;

// Types
export interface Permission {
    id: number;
    name: string;
    resource: string;
    action: string;
}

export interface Role {
    id: number;
    name: string;
    permissions?: Permission[];
}

export interface User {
    id: number;
    email: string;
    displayName: string;
    avatarUrl?: string;
    isActive: boolean;
    isVerified: boolean;
    roles: Role[];
}

export interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    hasPermission: (resource: string, action: string) => boolean;
    isAdmin: () => boolean;
    accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token storage keys
const ACCESS_TOKEN_KEY = 'nqrust_access_token';
const REFRESH_TOKEN_KEY = 'nqrust_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [accessToken, setAccessToken] = useState<string | null>(null);

    // GraphQL operations
    const { refetch: refetchMe } = useQuery(ME_QUERY, {
        skip: true, // We'll call this manually
        fetchPolicy: 'network-only',
    });

    const [loginMutation] = useMutation(LOGIN_MUTATION);
    const [registerMutation] = useMutation(REGISTER_MUTATION);
    const [logoutMutation] = useMutation(LOGOUT_MUTATION);
    const [refreshTokenMutation] = useMutation(REFRESH_TOKEN_MUTATION);

    // Load tokens from storage on mount and fetch user
    useEffect(() => {
        const initAuth = async () => {
            const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);

            if (!storedAccessToken) {
                setIsLoading(false);
                return;
            }

            setAccessToken(storedAccessToken);

            try {
                const { data } = await refetchMe();
                if (data?.me) {
                    setUser(data.me);
                }
            } catch {
                // Token might be expired, try to refresh
                const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
                if (refreshToken) {
                    try {
                        const { data } = await refreshTokenMutation({
                            variables: { refreshToken },
                        });
                        if (data?.refreshToken) {
                            localStorage.setItem(ACCESS_TOKEN_KEY, data.refreshToken.accessToken);
                            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken.refreshToken);
                            setAccessToken(data.refreshToken.accessToken);
                            setUser(data.refreshToken.user);
                        }
                    } catch {
                        // Refresh failed, clear tokens
                        localStorage.removeItem(ACCESS_TOKEN_KEY);
                        localStorage.removeItem(REFRESH_TOKEN_KEY);
                        setAccessToken(null);
                        setUser(null);
                    }
                } else {
                    localStorage.removeItem(ACCESS_TOKEN_KEY);
                    setAccessToken(null);
                }
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    const saveTokens = (newAccessToken: string, newRefreshToken: string) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
        setAccessToken(newAccessToken);
    };

    const clearTokens = () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        setUser(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
        }
    };

    const handleRefreshToken = useCallback(async (refreshToken: string) => {
        try {
            const { data } = await refreshTokenMutation({
                variables: { refreshToken },
            });
            if (data?.refreshToken) {
                saveTokens(data.refreshToken.accessToken, data.refreshToken.refreshToken);
                setUser(data.refreshToken.user);
            }
        } catch {
            clearTokens();
        }
    }, [refreshTokenMutation]);

    // Proactive token refresh: schedule refresh 1 minute before access token expires
    useEffect(() => {
        if (!accessToken) return;

        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            const expiresAt = payload.exp * 1000;
            const refreshAt = expiresAt - 3_600_000; // 1 hour before expiry
            const delay = refreshAt - Date.now();

            if (delay <= 0) {
                // Token already expired or about to — refresh immediately
                const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
                if (storedRefresh) handleRefreshToken(storedRefresh);
                return;
            }

            const timerId = setTimeout(() => {
                const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
                if (storedRefresh) handleRefreshToken(storedRefresh);
            }, delay);

            return () => clearTimeout(timerId);
        } catch {
            // Malformed token — will be caught on next API call
        }
    }, [accessToken, handleRefreshToken]);

    // Cross-tab auth sync: detect when another tab clears tokens
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === ACCESS_TOKEN_KEY && !e.newValue) {
                setUser(null);
                setAccessToken(null);
                if (!window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { data } = await loginMutation({
                variables: { data: { email, password } },
            });
            if (data?.login) {
                saveTokens(data.login.accessToken, data.login.refreshToken);
                setUser(data.login.user);
            }
        } finally {
            setIsLoading(false);
        }
    }, [loginMutation]);

    const register = useCallback(async (email: string, password: string, displayName: string) => {
        setIsLoading(true);
        try {
            const { data } = await registerMutation({
                variables: { data: { email, password, displayName } },
            });
            if (data?.register) {
                saveTokens(data.register.accessToken, data.register.refreshToken);
                setUser(data.register.user);
            }
        } finally {
            setIsLoading(false);
        }
    }, [registerMutation]);

    const logout = useCallback(async () => {
        try {
            await logoutMutation();
        } finally {
            clearTokens();
        }
    }, [logoutMutation]);

    const refreshUser = useCallback(async () => {
        if (!accessToken) return;
        try {
            const { data } = await refetchMe();
            if (data?.me) {
                setUser(data.me);
            }
        } catch {
            // Token might be expired
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
            if (refreshToken) {
                await handleRefreshToken(refreshToken);
            }
        }
    }, [accessToken, refetchMe, handleRefreshToken]);

    const hasPermission = useCallback((resource: string, action: string): boolean => {
        if (!user) return false;

        // Check if user has admin role (has all permissions)
        if (user.roles.some(role => role.name === 'admin')) {
            return true;
        }

        // Check specific permission
        for (const role of user.roles) {
            if (role.permissions) {
                for (const perm of role.permissions) {
                    if (perm.resource === resource && perm.action === action) {
                        return true;
                    }
                }
            }
        }
        return false;
    }, [user]);

    const isAdmin = useCallback((): boolean => {
        return user?.roles?.some(role => role.name === 'admin') ?? false;
    }, [user]);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
        hasPermission,
        isAdmin,
        accessToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
