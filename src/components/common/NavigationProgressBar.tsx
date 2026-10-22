'use client';
import {useSyncExternalStore} from 'react';
import {navigationSnapshot,navigationServerSnapshot,subscribeNavigation} from './navigation-state.mjs';
import './brand.css';
export function NavigationProgressBar(){const pending=useSyncExternalStore(subscribeNavigation,navigationSnapshot,navigationServerSnapshot);return pending?<div className="brand-navigation-progress" role="progressbar" aria-label="Loading page" aria-valuetext="Navigation in progress"><span/></div>:null;}
