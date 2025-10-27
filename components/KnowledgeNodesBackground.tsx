"use client"

import { useEffect, useRef, useState } from 'react'
import { KnowledgeNodesCanvas } from './KnowledgeNodesCanvas'

interface KnowledgeNodesBackgroundProps {
  className?: string
}

export function KnowledgeNodesBackground({ 
  className = "" 
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
          className="absolute inset-0 pointer-events-auto z-0"
        />
      )}
    </div>
  )
}
