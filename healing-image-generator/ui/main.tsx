import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/styles.css';
import { fontEngine } from '@engine';

// 字体就绪后再挂载（对齐旧版 start() 行为；加载失败也只是回退系统字体，不会 reject）
fontEngine.init(import.meta.env.BASE_URL).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
