import { useMemo } from 'react';
import SimpleLayout from '@/components/layouts/SimpleLayout';
import ContainerCard from '@/components/pages/setup/ContainerCard';
import useSetupModels from '@/hooks/useSetupModels';
import { SETUP_STEPS } from '@/components/pages/setup/utils';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function SetupModels() {
  const { fetching, stepKey, tables, onNext, onBack, submitting } =
    useSetupModels();

  const current = useMemo(() => SETUP_STEPS[stepKey], [stepKey]);

  return (
    <ProtectedRoute>
      <SimpleLayout>
        <ContainerCard step={current.step} maxWidth={current.maxWidth}>
          <current.component
            fetching={fetching}
            onBack={onBack}
            onNext={onNext}
            submitting={submitting}
            tables={tables}
          />
        </ContainerCard>
      </SimpleLayout>
    </ProtectedRoute>
  );
}
