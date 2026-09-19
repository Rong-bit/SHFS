import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyUiFontScale, readUiFontScale } from './utils/uiFontScale';

applyUiFontScale(readUiFontScale());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
