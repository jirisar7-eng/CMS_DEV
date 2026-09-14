"use client"
import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative cursor-pointer"
      title="Přepnout vzhled (světlý / tmavý)"
      aria-label="Přepnout vzhled"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Přepnout vzhled</span>
    </button>
  )
}
