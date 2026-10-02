import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { listenForStaleChunks } from '../utils/staleChunk';
import AdminApp from './AdminApp';
// Preload anchor: allows Vite to discover and modulepreload Supabase directly in admin.html.
import '../services/supabaseClient';

listenForStaleChunks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<AdminApp />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
