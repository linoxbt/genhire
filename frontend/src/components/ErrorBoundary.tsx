import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence against a white screen.
 *
 * A render-time throw anywhere in the tree unmounts the whole app and leaves an
 * empty <div id="root">, with the reason visible only in the console. That is
 * the worst possible failure mode for a page whose entire job is showing
 * someone the state of money they have escrowed - it is indistinguishable from
 * the site being down. This shows the error instead.
 */
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GenHire crashed while rendering:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto max-w-lg px-5 py-20">
        <div className="rounded-sm border border-seal-200 bg-seal-50 px-6 py-6">
          <h1 className="font-serif text-2xl font-semibold text-ink">Something broke on this page</h1>
          <p className="mt-2 text-sm text-seal-700">
            This is a fault in the app, not in the contract. Nothing on chain has changed.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-sm border border-seal-200 bg-white/60 p-3 font-mono text-[0.6875rem] text-ink-soft">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/88"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
