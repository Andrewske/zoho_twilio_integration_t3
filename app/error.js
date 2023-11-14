'use client' // Error components must be Client Components

import { useEffect } from 'react'


export default function Error({
    error,
    reset,
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        logError()
        console.error(error)
    }, [error])

    const logError = async () => {
        'use server'
        import Rollbar from 'rollbar'

        const rollbar = new Rollbar(process.env.ROLLBAR_POST_SERVER_ACCESS_TOKENR)

        rollbar.error(error, (rollbarError) => {
            if (rollbarError) {
                console.error('Rollbar error reporting failed:')
                console.error(rollbarError)
                return
            }

            console.log('Reported error to Rollbar')
        })
    }

    return (
        <div>
            <h2>Something went wrong!</h2>
            <button
                onClick={
                    // Attempt to recover by trying to re-render the segment
                    () => reset()
                }
            >
                Try again
            </button>
        </div>
    )
}