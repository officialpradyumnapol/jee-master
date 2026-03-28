import React, { useState } from 'react';
import { supabase } from './supabase';

const C = {
  bg: '#0b0918',
  card: '#120d2e',
  border: 'rgba(139,92,246,0.2)',
  purple: '#7c3aed',
  purpleLight: '#a78bfa',
  purpleBright: '#a855f7',
  text: '#e2d9f3',
  muted: 'rgba(167,139,250,0.5)',
  error: '#fca5a5',
  success: '#86efac',
};

const inputStyle = {
  width: '100%',
  padding: '13px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: `1.5px solid ${C.border}`,
  borderRadius: 12,
  color: C.text,
  fontSize: 15,
  fontFamily: "'Lora', serif",
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const btnStyle = {
  width: '100%',
  padding: '14px',
  background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
  border: 'none',
  borderRadius: 12,
  color: '#fff',
  fontSize: 15,
  fontFamily: "'Josefin Sans', sans-serif",
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  cursor: 'pointer',
  boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
  transition: 'opacity 0.2s, transform 0.1s',
};

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const clear = () => setMsg({ type: '', text: '' });

  const handleLogin = async () => {
    if (!email || !password) return setMsg({ type: 'error', text: 'Please fill all fields.' });
    setLoading(true); clear();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg({ type: 'error', text: error.message });
    onAuth(data.user);
  };

  const handleSignup = async () => {
    if (!email || !password) return setMsg({ type: 'error', text: 'Please fill all fields.' });
    if (password.length < 6) return setMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
    setLoading(true); clear();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setMsg({ type: 'error', text: error.message });
    if (data.user?.identities?.length === 0) {
      return setMsg({ type: 'error', text: 'This email is already registered. Please login.' });
    }
    setMsg({ type: 'success', text: 'Account created! Check your email to confirm, then login.' });
    setMode('login');
  };

  const handleForgot = async () => {
    if (!email) return setMsg({ type: 'error', text: 'Enter your email above first.' });
    setLoading(true); clear();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) return setMsg({ type: 'error', text: error.message });
    setMsg({ type: 'success', text: 'Password reset link sent to your email!' });
  };

  const handleSubmit = () => {
    if (mode === 'login') handleLogin();
    else if (mode === 'signup') handleSignup();
    else handleForgot();
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px', boxSizing: 'border-box',
      fontFamily: "'Lora', serif",
    }}>
      {/* Glow orb */}
      <div style={{
        position: 'fixed', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle,rgba(124,58,237,0.15) 0%,transparent 70%)',
        pointerEvents: 'none',
      }}/>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 14px',
          background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, boxShadow: '0 8px 32px rgba(124,58,237,0.5)',
        }}>📚</div>
        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: 26, color: '#fff',
          letterSpacing: 3, lineHeight: 1,
        }}>JEE <span style={{ color: C.purpleLight }}>MASTER</span></div>
        <div style={{
          fontSize: 11, fontFamily: "'Josefin Sans', sans-serif",
          fontWeight: 600, color: C.muted, letterSpacing: 2, marginTop: 4,
        }}>IIT PREP TRACKER</div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: C.card,
        border: `1.5px solid ${C.border}`,
        borderRadius: 20, padding: '28px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Tab switcher */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.05)',
          borderRadius: 10, padding: 4, marginBottom: 24, gap: 4,
        }}>
          {['login','signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); clear(); }} style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif", fontWeight: 700,
              fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase',
              background: mode === m ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'transparent',
              color: mode === m ? '#fff' : C.muted,
              transition: 'all 0.2s',
              boxShadow: mode === m ? '0 2px 10px rgba(124,58,237,0.4)' : 'none',
            }}>{m}</button>
          ))}
        </div>

        {/* Title */}
        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: 17, color: '#fff',
          marginBottom: 20, letterSpacing: 1,
        }}>
          {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="Email address"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = C.purpleBright}
            onBlur={e => e.target.style.borderColor = C.border}
          />
          {mode !== 'forgot' && (
            <input
              type="password" placeholder="Password"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.purpleBright}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          )}
        </div>

        {/* Forgot password link */}
        {mode === 'login' && (
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <span onClick={() => { setMode('forgot'); clear(); }} style={{
              fontSize: 12, color: C.muted, cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif", letterSpacing: 0.5,
            }}>Forgot password?</span>
          </div>
        )}

        {/* Message */}
        {msg.text && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 10,
            background: msg.type === 'error' ? 'rgba(252,165,165,0.1)' : 'rgba(134,239,172,0.1)',
            border: `1px solid ${msg.type === 'error' ? 'rgba(252,165,165,0.3)' : 'rgba(134,239,172,0.3)'}`,
            color: msg.type === 'error' ? C.error : C.success,
            fontSize: 13, fontFamily: "'Lora', serif", lineHeight: 1.5,
          }}>{msg.text}</div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...btnStyle, marginTop: 20, opacity: loading ? 0.7 : 1 }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Login' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
        </button>

        {/* Back from forgot */}
        {mode === 'forgot' && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <span onClick={() => { setMode('login'); clear(); }} style={{
              fontSize: 12, color: C.muted, cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif", letterSpacing: 0.5,
            }}>← Back to login</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 24, fontSize: 11, color: C.muted,
        fontFamily: "'Josefin Sans', sans-serif", letterSpacing: 1,
        textAlign: 'center',
      }}>
        YOUR PROGRESS SYNCS ACROSS ALL DEVICES
      </div>
    </div>
  );
}
