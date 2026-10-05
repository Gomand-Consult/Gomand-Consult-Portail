import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { initialUrlType } from './supabase';
import { Header, Loading, ErrorBox } from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import SetPassword from './pages/SetPassword';
import ClientDashboard, { ClientHome } from './pages/ClientDashboard';
import DocumentViewer from './pages/DocumentViewer';
import Gallery from './pages/Gallery';
import Privacy from './pages/Privacy';
import PrivacyGate from './pages/PrivacyGate';
import { PRIVACY_VERSION } from './config';
import AdminHome from './pages/admin/AdminHome';
import AdminClient from './pages/admin/AdminClient';

function NoAccess({ kind }) {
  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 56 }}>
        <ErrorBox>{kind === 'error' ? 'Votre espace n’a pas pu être chargé. Réessayez dans un instant.' : 'Votre accès n’est pas encore configuré. Écrivez à Anthony pour l’activer.'}</ErrorBox>
      </div>
    </>
  );
}

function Guard({ role, children }) {
  const { loading, session, profile, profileError } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
  if (!profile) return <NoAccess kind={profileError} />;
  if (role && profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : '/'} replace />;
  // Chaque client prend connaissance de la politique de confidentialité avant d'accéder à son espace.
  if (profile.role === 'client' && profile.privacy_version !== PRIVACY_VERSION) return <PrivacyGate />;
  return children;
}

function AdminPreview() {
  const { id } = useParams();
  return <ClientDashboard clientId={id} preview />;
}

// Un lien d'invitation arrive parfois à la racine du site : on le redirige vers le choix du mot de passe.
function InviteRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if ((initialUrlType === 'invite' || initialUrlType === 'recovery') && pathname !== '/definir-mot-de-passe') navigate('/definir-mot-de-passe', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <InviteRedirect />
          <Routes>
            <Route path="/connexion" element={<Login />} />
            <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
            <Route path="/definir-mot-de-passe" element={<SetPassword />} />
            <Route path="/confidentialite" element={<Privacy />} />
            <Route path="/" element={<Guard role="client"><ClientHome /></Guard>} />
            <Route path="/documents/:id" element={<Guard><DocumentViewer /></Guard>} />
            <Route path="/galeries/:id" element={<Guard><Gallery /></Guard>} />
            <Route path="/admin" element={<Guard role="admin"><AdminHome /></Guard>} />
            <Route path="/admin/clients/:id" element={<Guard role="admin"><AdminClient /></Guard>} />
            <Route path="/admin/clients/:id/apercu" element={<Guard role="admin"><AdminPreview /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
