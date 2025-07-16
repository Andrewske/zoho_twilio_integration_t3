// instrumentation.js
export function register() {
  // No-op for initialization
}

export const onRequestError = async (err, request, context) => {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { captureServerException, extractDistinctIdFromRequest } = await import('./utils/postHogServer/index.js');
      
      const distinctId = extractDistinctIdFromRequest(request);

      // Capture the exception with additional context
      await captureServerException(err, distinctId, {
        message: 'Server-side error caught by instrumentation',
        url: request.url,
        method: request.method,
        headers: {
          'user-agent': request.headers['user-agent'],
          'referer': request.headers['referer'],
        },
        component: 'NextJS Instrumentation'
      });
    } catch (instrumentationError) {
      console.error('Error in PostHog instrumentation:', instrumentationError);
    }
  }
};