import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/montserrat';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
