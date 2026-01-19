import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Spin } from 'antd';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredPermission?: {
        resource: string;
        action: string;
    };
    requireAdmin?: boolean;
}

/**
 * ProtectedRoute component - wraps pages that require authentication
 * Redirects to login if user is not authenticated
 * Optionally checks for specific permissions or admin role
 */
export default function ProtectedRoute({
    children,
    requiredPermission,
    requireAdmin = false,
}: ProtectedRouteProps) {
    const router = useRouter();
    const { isAuthenticated, isLoading, hasPermission, isAdmin } = useAuth();

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                // Store the attempted URL to redirect back after login
                sessionStorage.setItem('redirectAfterLogin', router.asPath);
                router.push('/login');
                return;
            }

            // Check admin requirement
            if (requireAdmin && !isAdmin()) {
                router.push('/home?error=unauthorized');
                return;
            }

            // Check specific permission
            if (requiredPermission) {
                const { resource, action } = requiredPermission;
                if (!hasPermission(resource, action)) {
                    router.push('/home?error=unauthorized');
                    return;
                }
            }
        }
    }, [isAuthenticated, isLoading, router, requireAdmin, requiredPermission, hasPermission, isAdmin]);

    // Show loading spinner while checking auth
    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: '#fff',
            }}>
                <Spin size="large" />
            </div>
        );
    }

    // Don't render children if not authenticated
    if (!isAuthenticated) {
        return null;
    }

    // Check admin requirement
    if (requireAdmin && !isAdmin()) {
        return null;
    }

    // Check specific permission
    if (requiredPermission) {
        const { resource, action } = requiredPermission;
        if (!hasPermission(resource, action)) {
            return null;
        }
    }

    return <>{children}</>;
}

/**
 * Higher-order component version for page-level protection
 */
export function withProtection<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    options?: {
        requiredPermission?: { resource: string; action: string };
        requireAdmin?: boolean;
    }
) {
    const ComponentWithProtection = (props: P) => (
        <ProtectedRoute
            requiredPermission={options?.requiredPermission}
            requireAdmin={options?.requireAdmin}
        >
            <WrappedComponent {...props} />
        </ProtectedRoute>
    );

    ComponentWithProtection.displayName = `withProtection(${WrappedComponent.displayName || WrappedComponent.name || 'Component'
        })`;

    return ComponentWithProtection;
}
