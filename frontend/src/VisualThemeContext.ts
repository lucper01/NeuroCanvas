import { createContext } from 'react'
import type { VisualTheme } from './localization'

export const VisualThemeContext = createContext<VisualTheme>('dark')
