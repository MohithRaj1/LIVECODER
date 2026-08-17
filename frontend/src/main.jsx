import './monacoEnv.js';
import './monacoLoader.js';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#1a1a2e',
          color: '#e2e8f0',
          border: '1px solid rgba(0, 212, 255, 0.2)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#6bcb77', secondary: '#1a1a2e' } },
        error: { iconTheme: { primary: '#ff6b6b', secondary: '#1a1a2e' } },
      }}
    />
  </BrowserRouter>
);
