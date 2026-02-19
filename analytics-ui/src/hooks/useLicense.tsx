import { useQuery, gql } from '@apollo/client';

const LICENSE_STATUS_QUERY = gql`
  query LicenseStatus {
    licenseStatus {
      isLicensed
      status
      isGracePeriod
      graceDaysRemaining
      customerName
      product
      features
      expiresAt
      activations
      maxActivations
      verifiedAt
      licenseKey
      errorMessage
    }
  }
`;

export interface LicenseState {
  isLicensed: boolean;
  status: string;
  isGracePeriod: boolean;
  graceDaysRemaining: number | null;
  customerName: string | null;
  product: string | null;
  features: string[];
  expiresAt: string | null;
  activations: number | null;
  maxActivations: number | null;
  verifiedAt: string | null;
  licenseKey: string | null;
  errorMessage: string | null;
}

export function useLicense() {
  const { data, loading, error, refetch } = useQuery(LICENSE_STATUS_QUERY, {
    fetchPolicy: 'cache-first',
  });

  return {
    license: (data?.licenseStatus as LicenseState) ?? null,
    isLoading: loading,
    error,
    refetch,
  };
}
