// client/src/pages/Work.tsx
// ============================================================
//  WORK  —  unified hub for Jobs + Tasks  (EKC re-skin)
//  Two views of the same idea (work with a target, an assignee
//  and a Pending/In Progress/Completed status):
//    • Production Jobs — machine-bound jobs with live progress
//    • Assignments     — tasks delegated down the org chart
//  Managers land on Jobs; operators land on their Assignments.
//  ?tab=tasks deep-links the Assignments view (used by the bell).
// ============================================================
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Send } from 'lucide-react';
import JobTracking from './JobTracking';
import Tasks from './Tasks';
import { useAuth } from '../context/auth';
import { can } from '@shared/permissions';
import { cn } from '../lib/utils';

type Tab = 'jobs' | 'tasks';

export default function Work() {
  const { role } = useAuth();
  const [params] = useSearchParams();
  const initial: Tab = params.get('tab') === 'tasks' || params.get('tab') === 'jobs'
    ? (params.get('tab') as Tab)
    : (can(role, 'assignJobs') ? 'jobs' : 'tasks'); // operators default to their assignments
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div>
      <div className="flex gap-2 px-5 sm:px-7 pt-1 pb-3.5">
        <TabBtn active={tab === 'jobs'} onClick={() => setTab('jobs')} icon={<ClipboardList size={15} />}>Production Jobs</TabBtn>
        <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<Send size={15} />}>Assignments</TabBtn>
      </div>
      {tab === 'jobs' ? <JobTracking /> : <Tasks />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold border transition-colors',
        active ? 'bg-accent border-accent text-white' : 'bg-base border-line text-steel hover:text-primary hover:border-accent/40'
      )}
    >
      {icon} {children}
    </button>
  );
}