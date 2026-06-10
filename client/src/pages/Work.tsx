// ============================================================
//  WORK  —  unified hub for Jobs + Tasks
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
      <div style={{ display: 'flex', gap: 8, padding: '0 28px 14px' }}>
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        border: `1px solid ${active ? 'var(--brand)' : 'var(--border-strong)'}`,
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-muted)',
        borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {icon} {children}
    </button>
  );
}
