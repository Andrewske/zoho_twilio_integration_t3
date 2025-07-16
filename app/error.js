'use client'; // Error components must be Client Components
import { useEffect } from 'react';
import posthog from 'posthog-js';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Capture the error with PostHog
    if (posthog.__loaded) {
      posthog.captureException(error, {
        message: 'Error component caught an error',
        level: 'error',
        component: 'NextJS Error Boundary',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('PostHog Error Boundary:', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong!</h2>
      <p className="text-gray-600 mb-6">We&apos;ve logged this error and will look into it.</p>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
