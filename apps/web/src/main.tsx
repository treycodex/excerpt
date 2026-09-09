import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import '@excerpt/ui/tokens.css';
import '@excerpt/ui/strip.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
