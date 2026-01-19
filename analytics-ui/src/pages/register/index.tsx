import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Registration page is disabled.
 * Users can only be created by administrators through the User Management page.
 * This page redirects to login.
 */
export default function RegisterPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/login');
    }, [router]);

    return null;
}
