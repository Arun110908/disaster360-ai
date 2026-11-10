import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LoginBar from './components/LoginBar.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(<><App /><LoginBar /></>);
