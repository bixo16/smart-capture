import { createRoot } from 'react-dom/client'
import type { Api } from '../../shared/types'
import { App } from './App'
import { NamePrompt } from './NamePrompt'
import { Overlay } from './Overlay'
import { RecorderBar } from './RecorderBar'
import { Splash } from './Update'
import './styles.css'

declare global {
  interface Window {
    api: Api
  }
}

const route = location.hash.slice(1).split('?')[0]
document.documentElement.dataset.route = route
const View = route === 'overlay' ? Overlay : route === 'recorder' ? RecorderBar : route === 'rename' ? NamePrompt : route === 'splash' ? Splash : App
createRoot(document.getElementById('root')!).render(<View />)
