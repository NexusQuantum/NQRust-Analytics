import { useMemo } from 'react';
import SimpleLayout from '@/components/layouts/SimpleLayout';
import ContainerCard from '@/components/pages/setup/ContainerCard';
import useSetupRelations from '@/hooks/useSetupRelations';
import { SETUP_STEPS } from '@/components/pages/setup/utils';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function SetupRelationships() {
  const {
    fetching,
    stepKey,
    recommendRelationsResult,
    onNext,
    onBack,
    onSkip,
    submitting,
  } = useSetupRelations();

  const current = useMemo(() => SETUP_STEPS[stepKey], [stepKey]);

  return (
    <ProtectedRoute>
      <SimpleLayout>
        <ContainerCard step={current.step} maxWidth={current.maxWidth}>
          <current.component
            fetching={fetching}
            {...recommendRelationsResult}
            onNext={onNext}
            onBack={onBack}
            onSkip={onSkip}
            submitting={submitting}
          />
        </ContainerCard>
      </SimpleLayout>
    </ProtectedRoute>
  );
}
