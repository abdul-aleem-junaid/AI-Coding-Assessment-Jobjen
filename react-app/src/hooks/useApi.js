// src/hooks/useApi.js
//
// Generic async-state hook.
// Wraps any async function (typically a service call) and tracks its
// loading / error / data lifecycle so components stay clean.
//
// Usage:
//   const { data, loading, error, run } = useApi(validateSession)
//   // call run() to trigger the async function
//   // call run(arg1, arg2) to pass arguments

import { useState, useCallback } from 'react'

/**
 * @template T
 * @param {(...args: any[]) => Promise<T>} asyncFn  The service function to wrap.
 * @returns {{
 *   data:    T | null,
 *   loading: boolean,
 *   error:   Error | null,
 *   run:     (...args: any[]) => Promise<T | undefined>,
 *   reset:   () => void,
 * }}
 */
export function useApi(asyncFn) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const run = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await asyncFn(...args)
      setData(result)
      return result
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [asyncFn])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, loading, error, run, reset }
}
