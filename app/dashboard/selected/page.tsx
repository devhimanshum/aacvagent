export const dynamic = 'force-dynamic';

import { CandidatesPage } from '@/components/candidates/CandidatesPage';

export default function OnboardPage() {
  return (
    <CandidatesPage
      decision="selected"
      title="Onboard Candidates"
      subtitle="Candidates approved and ready for onboarding"
      hideMailButton
    />
  );
}
