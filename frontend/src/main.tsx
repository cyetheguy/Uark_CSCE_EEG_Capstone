import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 1. Import the favicon image from the media folder using a relative path
import faviconImg from '../../media/DreamRT_SQRE_wp.png';

// 2. Inject it into the document head dynamically
const setFavicon = () => {
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = faviconImg;
};

// Run the favicon injection
setFavicon();

// 3. Render the app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);