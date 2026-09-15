"use client"

import * as React from "react"
import { Moon, Sun, Monitor, MoonStar } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // using a timeout prevents the synchronous state update in effect warning
    const timer = setTimeout(() => setMounted(true), 0);
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  if (!mounted) {
    return (
      <button className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground">
        <Sun className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative cursor-pointer"
        title="Nastavení vzhledu"
        aria-label="Nastavení vzhledu"
      >
        {theme === 'light' && <Sun className="h-5 w-5" />}
        {theme === 'dark' && <Moon className="h-5 w-5" />}
        {theme === 'extra-dark' && <MoonStar className="h-5 w-5" />}
        {theme === 'system' && <Monitor className="h-5 w-5" />}
        {!['light', 'dark', 'extra-dark', 'system'].includes(theme || '') && <Sun className="h-5 w-5" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="p-1 flex flex-col">
            <button
              onClick={() => { setTheme("light"); setIsOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-muted ${theme === 'light' ? 'bg-muted font-medium' : ''}`}
            >
              <Sun className="h-4 w-4" /> Světlý
            </button>
            <button
              onClick={() => { setTheme("dark"); setIsOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-muted ${theme === 'dark' ? 'bg-muted font-medium' : ''}`}
            >
              <Moon className="h-4 w-4" /> Tmavý
            </button>
            <button
              onClick={() => { setTheme("extra-dark"); setIsOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-muted ${theme === 'extra-dark' ? 'bg-muted font-medium' : ''}`}
            >
              <MoonStar className="h-4 w-4" /> Extra tmavý (OLED)
            </button>
            <div className="h-px bg-border my-1 mx-2" />
            <button
              onClick={() => { setTheme("system"); setIsOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-muted ${theme === 'system' ? 'bg-muted font-medium' : ''}`}
            >
              <Monitor className="h-4 w-4" /> Podle systému
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
