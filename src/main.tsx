import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
/** 電子戳章楷體後援（系統無標楷體時） */
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css';
import './index.css';
import { applyUiFontScale, readUiFontScale } from './utils/uiFontScale';

applyUiFontScale(readUiFontScale());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
