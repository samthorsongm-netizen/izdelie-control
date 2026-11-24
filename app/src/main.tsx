import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './theme.css'

// тему ставим до первой отрисовки, чтобы не мигало белым
document.documentElement.dataset.theme = localStorage.getItem('ui-theme') === 'dark' ? 'dark' : 'light'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
