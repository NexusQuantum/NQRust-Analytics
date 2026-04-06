import NextAuth from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: number;
            email: string;
            displayName: string;
            avatarUrl?: string;
            isActive: boolean;
            isVerified: boolean;
            roles: Array<{
                id: number;
                name: string;
                permissions: Array<{
                    id: number;
                    name: string;
                    resource: string;
                    action: string;
                }>;
            }>;
        };
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        userId: number;
        email: string;
        displayName: string;
        avatarUrl?: string;
        roles: Array<{
            id: number;
            name: string;
            permissions: Array<{
                id: number;
                name: string;
                resource: string;
                action: string;
            }>;
        }>;
    }
}
