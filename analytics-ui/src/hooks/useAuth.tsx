import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useApolloClient } from '@apollo/client';

// Types — kept identical to old interface so all consumers compile unchanged
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

export function AuthProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const apolloClient = useApolloClient();
    const isLoading = status === 'loading';
    const user = (session?.user as User | undefined) ?? null;

    const login = useCallback(async (email: string, password: string) => {
        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });
        if (result?.error) {
            throw new Error('Invalid email or password');
        }
    }, []);

    const register = useCallback(async (_email: string, _password: string, _displayName: string) => {
        // Registration is done via GraphQL mutation register() — not via NextAuth signIn.
        // After a successful register mutation the caller should call login() to start a session.
        throw new Error('Use the register GraphQL mutation, then call login()');
    }, []);

    const logout = useCallback(async () => {
        // Clear Apollo cache before signing out so active queries don't
        // attempt cache reads during component unmount (avoids canonizeResults warning).
        await apolloClient.clearStore();
        await signOut({ callbackUrl: '/login' });
    }, [apolloClient]);

    const refreshUser = useCallback(async () => {
        // NextAuth refreshes the session automatically via SessionProvider refetchInterval.
        // Nothing to do here.
    }, []);

    const hasPermission = useCallback((resource: string, action: string): boolean => {
        if (!user) return false;
        if (user.roles.some(r => r.name === 'admin')) return true;
        return user.roles.some(role =>
            role.permissions?.some(p => p.resource === resource && p.action === action)
        );
    }, [user]);

    const isAdmin = useCallback((): boolean => {
        return user?.roles?.some(r => r.name === 'admin') ?? false;
    }, [user]);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated: status === 'authenticated',
        login,
        register,
        logout,
        refreshUser,
        hasPermission,
        isAdmin,
        accessToken: null,
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
