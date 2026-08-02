import { mount } from 'svelte';
import Root from './Root.svelte';
import './app.css';

mount(Root, { target: document.getElementById('app')! });

// Only register in production builds — a SW in Vite dev caches HMR shells and fights reloads.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('ServiceWorker registered:', reg.scope))
      .catch((err) => console.error('ServiceWorker registration failed:', err));
  });
}
