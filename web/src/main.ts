import { mount } from 'svelte';
import Root from './Root.svelte';
import './app.css';

mount(Root, { target: document.getElementById('app')! });
