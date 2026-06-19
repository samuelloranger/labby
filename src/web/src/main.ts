import { mount } from 'svelte';
import Root from './Root.svelte';
import './app.css';

mount(Root, { target: document.getElementById('app')! });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('ServiceWorker registered:', reg.scope))
      .catch((err) => console.error('ServiceWorker registration failed:', err));
  });
}
