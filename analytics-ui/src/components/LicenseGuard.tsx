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

  const isPublicPage = SKIP_PATHS.some((p) =>
    router.pathname.startsWith(p),
  );

  // Redirect only when the license is *definitively* invalid. Transient
  // states ('unreachable' or 'null' = not yet checked) keep the user on
  // their current page — mirrors the portal's pattern of trusting the
  // server-side grace handling rather than nagging the user on network
  // hiccups. No toast, no flash.
  useEffect(() => {
    if (isPublicPage || !license || error) return;

    const definitivelyInvalid =
      !license.isLicensed && license.lastCheckResult === 'invalid';
    if (definitivelyInvalid) {
      router.replace(LICENSE_PAGE);
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
