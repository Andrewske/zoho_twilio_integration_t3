"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Capture the global error with PostHog
    if (posthog.__loaded) {
      posthog.captureException(error, {
        message: 'Global error boundary caught an error',
        level: 'error',
        component: 'NextJS Global Error Boundary',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('PostHog Global Error Boundary:', error);
    }
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Application Error</h1>
          <p className="text-gray-600 mb-6">A critical error occurred. We&apos;ve logged this issue and will investigate.</p>
          {reset && (
            <button
              className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              onClick={() => reset()}
            >
              Try to recover
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
