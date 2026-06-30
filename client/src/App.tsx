import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { useAuth } from './context/auth';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ErrorBoundary from './components/ErrorBoundary';
import { NAV, ROLE_NAV } from './config/nav';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Machines from './pages/Machines';
import MachineDetail from './pages/MachineDetail';
import Downtime from './pages/Downtime';
import Work from './pages/Work';
import History from './pages/History';
import OperatorMap from './pages/OperatorMap';
import Org from './pages/Org';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Settings from './pages/Settings';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import { AiQuery, Placeholder } from './pages/Misc';

function pageFor(key: string) {
  switch (key) {
    case 'dashboard': return <Dashboard />;
    case 'machines': return <Machines />;
    case 'jobs':
    case 'jobTracking': return <Work />;
    case 'downtime': return <Downtime />;
    case 'history':
    case 'historyLog': return <History />;
    case 'operatorMap': return <OperatorMap />;
    case 'org': return <Org />;
    case 'users': return <Users />;
    case 'roles': return <Roles />;
    case 'settings': return <Settings />;
    case 'alerts': return <Alerts />;
    case 'reports': return <Reports />;
    case 'notifications': return <Notifications />;
    case 'aiQuery': return <AiQuery />;
    default: return <Placeholder title={NAV[key]?.label ?? key} />;
  }
}

function Shell() {
  const { role } = useAuth();
  const location = useLocation();
  if (!role) return null; // gate guarantees a user, this satisfies TS
  const allowed = ROLE_NAV[role];
  const currentKey = location.pathname.replace('/', '') || 'dashboard';
  const isMachineDetail = /^machines\/.+/.test(currentKey);
  const title = isMachineDetail ? 'Machine' : (NAV[currentKey]?.label ?? 'Dashboard');
  const subtitle = isMachineDetail ? 'Live telemetry, history & controls' : NAV[currentKey]?.subtitle;

  if (currentKey !== '' && currentKey !== 'dashboard' && !allowed.includes(currentKey) && NAV[currentKey]) {
    return <Navigate to={`/${allowed[0]}`} replace />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <Topbar title={title} subtitle={subtitle} />
        <ErrorBoundary key={currentKey}>
          <Routes>
            <Route path="/" element={<Navigate to={`/${allowed[0]}`} replace />} />
            <Route path="/machines/:code" element={<MachineDetail />} />
            {Object.keys(NAV).map((key) => (
              <Route key={key} path={`/${key}`} element={pageFor(key)} />
            ))}
            <Route path="*" element={<Navigate to={`/${allowed[0]}`} replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

// Decides what to show based on auth state:
//   loading        → splash
//   no user        → Login
//   mustChange pwd → ChangePassword (first login)
//   otherwise      → the role-based dashboard shell
function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#9ca3af' }}>Loading…</div>;
  }
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword firstLogin />;
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
