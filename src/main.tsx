import { createRoot } from 'react-dom/client'
import './index.css'
import 'grapesjs/dist/css/grapes.min.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <App />,
)
