import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AuthScreen from './AuthScreen';
import { supabase, createCloudStorage } from './supabase';

function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if already logged in (persists across page refreshes)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      // Inject cloud storage globally as soon as we know the user
      window.storage = createCloudStorage(u?.id ?? null);
      setChecking(false);
    });

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      window.storage = createCloudStorage(u?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0b0918',
        fontFamily: "'Josefin Sans', sans-serif",
        fontSize: 13, color: 'rgba(167,139,250,0.5)',
        letterSpacing: 2,
      }}>LOADING...</div>
    );
  }

  if (!user) return <AuthScreen onAuth={(u) => setUser(u)} />;

  return <App user={user} onLogout={async () => {
    await supabase.auth.signOut();
    setUser(null);
  }} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
