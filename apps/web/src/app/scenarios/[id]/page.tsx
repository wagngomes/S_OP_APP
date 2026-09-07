'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getScenario } from '../../../lib/api';

export default function ScenarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    getScenario(id).then((scenario) => {
      switch (scenario.phase) {
        case 'TEAM_SETUP':
          router.replace(`/scenarios/${id}/team`);
          break;
        case 'IMPORT_SETUP':
          router.replace(`/scenarios/${id}/upload`);
          break;
        case 'CALCULATION':
          router.replace(`/scenarios/${id}/forecast`);
          break;
        case 'APPROVAL':
          router.replace(`/scenarios/${id}/approval`);
          break;
        default:
          break;
      }
    });
  }, [id, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-texto-principal/60">Carregando cenário…</p>
    </div>
  );
}
