import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@excerpt/ui/tokens.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
