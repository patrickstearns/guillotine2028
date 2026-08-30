import './styles.css';
import { mountApp } from './ui/app';
import { preloadCardAssets } from './preload';

preloadCardAssets();
mountApp(document.getElementById('app')!);
