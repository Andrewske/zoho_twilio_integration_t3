'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogProvider({ children }) {
    useEffect(() => {
        const isProduction = !window.location.host.includes('127.0.0.1') && 
                           !window.location.host.includes('localhost');
        const enableDev = process.env.NEXT_PUBLIC_POSTHOG_ENABLE_DEV === 'true';
        
        if (isProduction || enableDev) {
            posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '', {
                api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
                capture_pageview: false, // Disable automatic pageview capture, as we capture manually
                capture_pageleave: true,
                // Enable automatic exception capture
                capture_exceptions: {
                    capture_unhandled_errors: true,
                    capture_unhandled_rejections: true,
                    capture_console_errors: false // We'll handle these manually for better control
                },
                // Additional error handling configuration
                loaded: (posthog) => {
                    console.log('PostHog loaded successfully', { 
                        isProduction, 
                        enableDev,
                        environment: process.env.NODE_ENV 
                    });
                },
                debug: process.env.NODE_ENV === 'development' || enableDev
            });

            // Set up global error listeners for additional error capture
            window.addEventListener('error', (event) => {
                if (posthog.__loaded) {
                    posthog.captureException(event.error, {
                        message: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                        component: 'Global Error Listener',
                        timestamp: new Date().toISOString()
                    });
                }
            });

            window.addEventListener('unhandledrejection', (event) => {
                if (posthog.__loaded) {
                    posthog.captureException(event.reason, {
                        message: 'Unhandled Promise Rejection',
                        component: 'Promise Rejection Handler',
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }
    }, []);

    return <PHProvider client={posthog}>{children}</PHProvider>;
}
