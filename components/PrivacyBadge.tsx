"use client"

import { Badge } from "@/components/ui/badge"
import { ShieldCheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

export default function PrivacyBadge() {
  const [isExpanded, setIsExpanded] = useState(false)
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  if (!isHomePage) {
    return null
  }

  return (
    <div className="fixed right-6 top-28 z-50">
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border border-border",
            "bg-background/95 backdrop-blur-sm shadow-sm hover:shadow-md",
            "transition-all duration-200 cursor-pointer",
            "hover:bg-muted/50"
          )}
        >
          <ShieldCheckIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Privacy and Security</span>
          <ChevronDownIcon className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </button>
        {isExpanded && (
          <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg max-w-xs">
            <div className="flex items-start gap-2 mb-2">
              <ShieldCheckIcon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Your data is secured by{" "}
                    <a 
                      href="https://supabase.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Supabase
                      <Image
                        src="/supabase.png"
                        alt="Supabase"
                        width={80}
                        height={20}
                        className="h-4 w-auto ml-1"
                      />
                    </a>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  AI APIs do not use your data for training or make it publicly available. 
                  Your research data remains private and confidential.
                </p>
                <Link 
                  href="/privacy-terms" 
                  className="text-xs text-primary hover:underline inline-block"
                >
                  Click here for the full privacy statement
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

