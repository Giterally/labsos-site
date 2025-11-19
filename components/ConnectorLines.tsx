"use client"

import { useEffect, useRef } from 'react'

interface ConnectorLinesProps {
  containerRef: React.RefObject<HTMLDivElement>
  className?: string
}

export function ConnectorLines({ containerRef, className = "" }: ConnectorLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const timeRef = useRef(0)
  const mouseRef = useRef({ x: 0, y: 0 })

  const connectionColors = ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784']
  const glowRadiusSquared = 80 * 80

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }

    containerRef.current.addEventListener('mousemove', handleMouseMove)

    const draw = () => {
      if (!ctx || !containerRef.current) return

      const width = canvas.width
      const height = canvas.height

      ctx.clearRect(0, 0, width, height)

      timeRef.current += 16 // ~60fps

      // Define connection points
      // Left block: Cloud Storage (16.666% of width), top (0% of height)
      // Middle block: AI Assistants (50% of width), top (0% of height)
      // Right block: Note-Taking Tools (83.333% of width), top (0% of height)
      // All converge to center (50% of width), bottom (100% of height)
      const connections = [
        { from: { x: width * 0.1666, y: 0 }, to: { x: width * 0.5, y: height }, color: connectionColors[2] }, // Blue - Cloud Storage
        { from: { x: width * 0.5, y: 0 }, to: { x: width * 0.5, y: height }, color: connectionColors[1] }, // Light green - AI Assistants
        { from: { x: width * 0.8333, y: 0 }, to: { x: width * 0.5, y: height }, color: connectionColors[0] }, // Dark green - Note-Taking Tools
      ]

      ctx.lineWidth = 10
      ctx.globalAlpha = 0.2

      connections.forEach((conn) => {
        const midX = (conn.from.x + conn.to.x) / 2
        const midY = (conn.from.y + conn.to.y) / 2

        // Calculate cursor proximity for glow effect
        const dx = midX - mouseRef.current.x
        const dy = midY - mouseRef.current.y
        const cursorDistanceSquared = dx * dx + dy * dy

        ctx.strokeStyle = conn.color

        // Add subtle pulsing to connections
        const pulse = Math.sin(timeRef.current * 0.001 + conn.from.x * 0.01) * 0.1 + 0.2

        // Enhanced glow when cursor is nearby
        if (cursorDistanceSquared < glowRadiusSquared) {
          const glowIntensity = Math.max(0, 1 - Math.sqrt(cursorDistanceSquared) / 80)
          ctx.globalAlpha = pulse + (glowIntensity * 0.15)
          ctx.lineWidth = 10 + (glowIntensity * 5)

          // Subtle glow effect
          ctx.shadowColor = conn.color
          ctx.shadowBlur = glowIntensity * 6
        } else {
          ctx.globalAlpha = pulse
          ctx.lineWidth = 10
          ctx.shadowBlur = 0
        }

        ctx.beginPath()
        ctx.moveTo(conn.from.x, conn.from.y)
        ctx.lineTo(conn.to.x, conn.to.y)
        ctx.stroke()

        // Reset shadow
        ctx.shadowBlur = 0
      })

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove)
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [containerRef])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 1 }}
    />
  )
}

