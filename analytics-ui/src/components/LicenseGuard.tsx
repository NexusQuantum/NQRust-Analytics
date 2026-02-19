import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useLicense } from '@/hooks/useLicense';

const LICENSE_PAGE = '/setup/license';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes

const SKIP_PATHS = ['/setup/license', '/login', '/register'];

export default function LicenseGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { license, error, refetch } = useLicense();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const cookieSetRef = useRef(false);

  const isPublicPage = SKIP_PATHS.some((p) =>
    router.pathname.startsWith(p),
  );

  // When license is valid, ensure the middleware cookie is set
  useEffect(() => {
    if (license?.isLicensed && !cookieSetRef.current) {
      cookieSetRef.current = true;
      fetch('/api/license-check').catch(() => {});
    }
    if (license && !license.isLicensed) {
      cookieSetRef.current = false;
    }
  }, [license?.isLicensed]);

  // Redirect when license is definitively invalid (not on error/loading)
  useEffect(() => {
    if (isPublicPage || !license || error) return;

    if (!license.isLicensed) {
      fetch('/api/license-check').finally(() => {
        router.replace(LICENSE_PAGE);
      });
    }
  }, [license, error, isPublicPage, router]);

  // Only start periodic re-check when license is loaded and valid
  useEffect(() => {
    if (isPublicPage || error || !license?.isLicensed) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      refetch();
    }, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPublicPage, error, license?.isLicensed, refetch]);

  return <>{children}</>;
}
