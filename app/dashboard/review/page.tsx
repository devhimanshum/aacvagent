export const dynamic = 'force-dynamic';

import { Header } from '@/components/layout/Header';
import { CandidateReviewBoard } from '@/components/review/CandidateReviewBoard';

export default function ReviewPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Selected Candidates"
        subtitle="AI-analysed CVs ready for review — onboard or reject"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <CandidateReviewBoard />
      </div>
    </div>
  );
}
