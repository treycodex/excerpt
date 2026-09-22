import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import '@excerpt/ui/tokens.css';
import '@excerpt/ui/strip.css';
import './app.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>,
);
