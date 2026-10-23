import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error Boundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h1>⚠️ Terjadi Kesalahan</h1>
          <p style={{ color: 'red', fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </p>
          <pre style={{ background: '#f0f0f0', padding: '1rem', overflow: 'auto' }}>
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()}>
            Muat Ulang
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)