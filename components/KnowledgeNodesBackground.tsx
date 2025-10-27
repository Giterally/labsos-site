"use client"

import { useEffect, useRef, useState } from 'react'
import { KnowledgeNodesCanvas } from './KnowledgeNodesCanvas'

interface KnowledgeNodesBackgroundProps {
  className?: string
  interactive?: boolean
  animated?: boolean
  transitionStart?: string
  transitionEnd?: string
}

export function KnowledgeNodesBackground({ 
  className = "",
  interactive = true,
  animated = true,
  transitionStart,
  transitionEnd
}: KnowledgeNodesBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Ensure container is ready before rendering canvas
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div 
      ref={containerRef}
      className={`${className}`}
      style={{ minHeight: '100%', minWidth: '100%' }}
    >
      {/* Interactive Knowledge Nodes Background */}
      {isReady && (
        <KnowledgeNodesCanvas 
          containerRef={containerRef}
          className={`absolute z-0 ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
          interactive={interactive}
          animated={animated}
          transitionStart={transitionStart}
          transitionEnd={transitionEnd}
          style={{ 
            top: '-40px',
            left: '-40px',
            width: 'calc(100% + 80px)',
            height: 'calc(100% + 80px)'
          }}
        />
      )}
    </div>
  )
}
