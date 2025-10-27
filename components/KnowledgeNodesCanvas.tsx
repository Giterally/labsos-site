"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'

interface KnowledgeNodesCanvasProps {
  containerRef: React.RefObject<HTMLDivElement>
  className?: string
  interactive?: boolean
  animated?: boolean
  style?: React.CSSProperties
  transitionStart?: string
  transitionEnd?: string
}

interface Node {
  x: number
  y: number
  originalX: number
  originalY: number
  vx: number
  vy: number
  size: number
  color: string
  connections: number[]
}

export function KnowledgeNodesCanvas({ 
  containerRef, 
  className = "",
  interactive = true,
  animated = true,
  style,
  transitionStart,
  transitionEnd
}: KnowledgeNodesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const nodesRef = useRef<Node[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const timeRef = useRef(0)
  const [isMobile, setIsMobile] = useState(false)

  // Configuration
  const config = {
    nodeCount: isMobile ? 200 : 400, // Much higher density for full page coverage
    particleCount: isMobile ? 300 : 600,
    repulsionRadius: 140, // Increased radius for more interaction area
    repulsionStrength: 0.5, // Increased from 0.3 for more responsive movement
    springStrength: 0.08, // Increased from 0.05 for faster return
    colors: ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784', '#A5D6A7', '#66BB6A', '#26A69A', '#42A5F5', '#29B6F6', '#5C6BC0']
  }

  const generateNodes = useCallback((width: number, height: number): Node[] => {
    const nodes: Node[] = []
    const minDistance = 25 // Tighter packing for higher density
    
    // Calculate maximum boundary distance: max node size (10) + max glow (30) = 40px
    const maxNodeSize = 10 // 4 + 6 from size calculation
    const maxGlowSize = 30 // 10 * 3 * 1.0 from glow calculation
    const boundaryDistance = maxNodeSize + maxGlowSize // 40px total
    
    for (let i = 0; i < config.nodeCount; i++) {
      let attempts = 0
      let validPosition = false
      let x = 0, y = 0
      
      while (!validPosition && attempts < 50) {
        // Keep nodes within boundary distance from edges
        x = Math.random() * (width - 2 * boundaryDistance) + boundaryDistance
        y = Math.random() * (height - 2 * boundaryDistance) + boundaryDistance
        
        validPosition = true
        for (const node of nodes) {
          const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
          if (distance < minDistance) {
            validPosition = false
            break
          }
        }
        attempts++
      }
      
      if (validPosition) {
        nodes.push({
          x,
          y,
          originalX: x,
          originalY: y,
          vx: 0,
          vy: 0,
          size: 4 + Math.random() * 6, // Much larger nodes for better visibility
          color: config.colors[Math.floor(Math.random() * config.colors.length)],
          connections: []
        })
      }
    }
    
    // Create connections with maximum density
    for (let i = 0; i < nodes.length; i++) {
      const nearbyNodes = []
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) {
          const distance = Math.sqrt((nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2)
          if (distance < 300) { // Increased connection range for more connections
            nearbyNodes.push({ index: j, distance })
          }
        }
      }
      
      // Sort by distance and connect to many more nodes
      nearbyNodes.sort((a, b) => a.distance - b.distance)
      const maxConnections = Math.min(15, nearbyNodes.length) // Up to 15 connections per node
      const connectionsToMake = Math.min(maxConnections, Math.floor(Math.random() * 8) + 8) // 8-15 connections
      
      for (let k = 0; k < connectionsToMake; k++) {
        const targetIndex = nearbyNodes[k].index
        if (!nodes[i].connections.includes(targetIndex)) {
          nodes[i].connections.push(targetIndex)
          nodes[targetIndex].connections.push(i)
        }
      }
    }
    
    return nodes
  }, [config.nodeCount, config.colors])

  const updateNodes = useCallback((deltaTime: number) => {
    const nodes = nodesRef.current
    const mouse = mouseRef.current
    const time = timeRef.current
    
    // Calculate transition zone if provided
    let transitionStartY = 0
    let transitionEndY = 0
    let hasTransition = false
    
    if (transitionStart && transitionEnd && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      
      // Parse CSS calc values - convert viewport height to actual pixels
      const startOffset = parseFloat(transitionStart.replace('calc(100vh + ', '').replace('px)', ''))
      const endOffset = parseFloat(transitionEnd.replace('calc(100vh + ', '').replace('px)', ''))
      
      transitionStartY = viewportHeight + startOffset
      transitionEndY = viewportHeight + endOffset
      hasTransition = true
    }
    
    for (const node of nodes) {
      // Calculate transition factor based on node position
      let transitionFactor = 1.0 // Full interactivity/animation by default
      
      if (hasTransition) {
        const nodeY = node.y
        if (nodeY >= transitionStartY && nodeY <= transitionEndY) {
          // In transition zone - gradually reduce interactivity/animation
          transitionFactor = 1.0 - ((nodeY - transitionStartY) / (transitionEndY - transitionStartY))
        } else if (nodeY > transitionEndY) {
          // Below transition zone - no interactivity/animation
          transitionFactor = 0.0
        }
        // Above transition zone - keep full interactivity/animation (transitionFactor = 1.0)
      } else if (!animated) {
        transitionFactor = 0.0
      }
      
      if (transitionFactor === 0.0) {
        // If no animation, keep nodes at original positions
        node.x = node.originalX
        node.y = node.originalY
        node.vx = 0
        node.vy = 0
        continue
      }
      
      // Calculate repulsion from mouse (only if interactive and in interactive zone)
      if (interactive && transitionFactor > 0) {
        const dx = node.x - mouse.x
        const dy = node.y - mouse.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < config.repulsionRadius && distance > 0) {
          // Use quadratic falloff for more dramatic response near cursor
          const force = Math.pow((config.repulsionRadius - distance) / config.repulsionRadius, 1.5)
          const angle = Math.atan2(dy, dx)
          
          node.vx += Math.cos(angle) * force * config.repulsionStrength * 120 * transitionFactor
          node.vy += Math.sin(angle) * force * config.repulsionStrength * 120 * transitionFactor
        }
      }
      
      // Spring force back to original position
      const springDx = node.originalX - node.x
      const springDy = node.originalY - node.y
      
      node.vx += springDx * config.springStrength * 120 * transitionFactor
      node.vy += springDy * config.springStrength * 120 * transitionFactor
      
      // Enhanced ambient movement - always active but reduced near mouse and in transition
      const mouseDistance = interactive ? Math.sqrt((node.x - mouse.x) ** 2 + (node.y - mouse.y) ** 2) : config.repulsionRadius + 1
      const ambientStrength = mouseDistance > config.repulsionRadius ? 1.0 : Math.max(0.2, mouseDistance / config.repulsionRadius)
      
      // Multiple wave patterns for complex ambient movement
      const wave1 = Math.sin(time * 0.0008 + node.originalX * 0.008) * 0.8
      const wave2 = Math.cos(time * 0.0012 + node.originalY * 0.012) * 0.6
      const wave3 = Math.sin(time * 0.0006 + (node.originalX + node.originalY) * 0.01) * 0.4
      
      // Perpendicular movement for circular patterns
      const perpWave1 = Math.cos(time * 0.0009 + node.originalX * 0.009) * 0.5
      const perpWave2 = Math.sin(time * 0.0011 + node.originalY * 0.011) * 0.3
      
      // Apply ambient movement with transition factor
      node.vx += (wave1 + wave3) * ambientStrength * 0.4 * transitionFactor
      node.vy += (wave2 + perpWave1) * ambientStrength * 0.4 * transitionFactor
      node.vx += perpWave2 * ambientStrength * 0.2 * transitionFactor
      node.vy += wave1 * ambientStrength * 0.2 * transitionFactor
      
      // Apply damping - reduced for more responsive movement
      node.vx *= 0.82 // Reduced from 0.88
      node.vy *= 0.82
      
      // Update position
      node.x += node.vx * deltaTime
      node.y += node.vy * deltaTime
      
      // Boundary constraints - keep nodes within safe distance from edges
      const maxNodeSize = 10 // 4 + 6 from size calculation
      const maxGlowSize = 30 // 10 * 3 * 1.0 from glow calculation
      const boundaryDistance = maxNodeSize + maxGlowSize // 40px total
      
      // Get canvas dimensions for boundary checking
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const paddedWidth = rect.width + 80
        const paddedHeight = rect.height + 80
        
        // Constrain to boundaries
        node.x = Math.max(boundaryDistance, Math.min(paddedWidth - boundaryDistance, node.x))
        node.y = Math.max(boundaryDistance, Math.min(paddedHeight - boundaryDistance, node.y))
      }
    }
  }, [config, interactive, animated, transitionStart, transitionEnd, containerRef])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const rect = canvas.getBoundingClientRect()
    // Add padding for glow effects (40px on each side)
    const paddedWidth = rect.width + 80
    const paddedHeight = rect.height + 80
    
    canvas.width = paddedWidth * window.devicePixelRatio
    canvas.height = paddedHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    
    // Clear canvas
    ctx.clearRect(0, 0, paddedWidth, paddedHeight)
    
    const nodes = nodesRef.current
    
    // Draw connections with varying opacity and colors
    ctx.lineWidth = 0.8
    ctx.globalAlpha = 0.2
    
    const connectionColors = ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784']
    
    for (const node of nodes) {
      for (const connectionIndex of node.connections) {
        const connectedNode = nodes[connectionIndex]
        if (connectedNode) {
          // Vary connection colors and opacity
          const colorIndex = Math.floor(Math.random() * connectionColors.length)
          ctx.strokeStyle = connectionColors[colorIndex]
          
          // Add subtle pulsing to connections
          const pulse = Math.sin(timeRef.current * 0.001 + node.x * 0.01) * 0.1 + 0.2
          ctx.globalAlpha = pulse
          
          ctx.beginPath()
          ctx.moveTo(node.x, node.y)
          ctx.lineTo(connectedNode.x, connectedNode.y)
          ctx.stroke()
        }
      }
    }
    
    // Draw many more particles flowing along connections
    ctx.globalAlpha = 0.7
    
    for (const node of nodes) {
      for (const connectionIndex of node.connections) {
        const connectedNode = nodes[connectionIndex]
        if (connectedNode) {
          // Many more particles per connection for maximum density
          for (let p = 0; p < 8; p++) {
            const particleOffset = p * 0.33
            const progress = ((Math.sin(timeRef.current * 0.003 + node.x * 0.01 + particleOffset) + 1) / 2 + particleOffset) % 1
            const particleX = node.x + (connectedNode.x - node.x) * progress
            const particleY = node.y + (connectedNode.y - node.y) * progress
            
            // Vary particle colors
            const colors = ['#4FC3F7', '#81C784', '#A5D6A7', '#66BB6A']
            ctx.fillStyle = colors[p % colors.length]
            
            ctx.beginPath()
            ctx.arc(particleX, particleY, 1 + Math.sin(timeRef.current * 0.005 + particleX * 0.02) * 0.3, 0, Math.PI * 2) // Smaller particles
            ctx.fill()
          }
        }
      }
    }
    
    // Draw nodes
    ctx.globalAlpha = 0.9
    
    for (const node of nodes) {
      // Node glow with pulsing effect
      const pulse = Math.sin(timeRef.current * 0.002 + node.originalX * 0.01) * 0.3 + 0.7
      const glowSize = node.size * 3 * pulse // Increased glow multiplier for larger nodes
      
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)
      gradient.addColorStop(0, node.color)
      gradient.addColorStop(0.7, node.color + '40')
      gradient.addColorStop(1, 'transparent')
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Node core with size variation
      const coreSize = node.size * (1.0 + Math.sin(timeRef.current * 0.001 + node.originalY * 0.008) * 0.2) // Increased base size
      ctx.fillStyle = node.color
      ctx.beginPath()
      ctx.arc(node.x, node.y, coreSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Node highlight with dynamic positioning
      const highlightOffset = Math.sin(timeRef.current * 0.0015 + node.originalX * 0.012) * 0.2
      const highlightX = node.x - node.size * (0.3 + highlightOffset)
      const highlightY = node.y - node.size * (0.3 + highlightOffset)
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.beginPath()
      ctx.arc(highlightX, highlightY, node.size * 0.25, 0, Math.PI * 2)
      ctx.fill()
      
      // Add subtle inner glow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])

  const animate = useCallback((currentTime: number) => {
    const deltaTime = (currentTime - timeRef.current) / 1000
    timeRef.current = currentTime
    
    updateNodes(deltaTime)
    draw()
    
    animationRef.current = requestAnimationFrame(animate)
  }, [updateNodes, draw])

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    // Adjust for padding offset (40px on each side)
    mouseRef.current = {
      x: event.clientX - rect.left + 40,
      y: event.clientY - rect.top + 40
    }
    
  }, [])

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 }
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      setTimeout(() => {
        const newRect = container.getBoundingClientRect()
        if (newRect.width > 0 && newRect.height > 0) {
          // Add padding for glow effects (40px on each side)
          const paddedWidth = newRect.width + 80
          const paddedHeight = newRect.height + 80
          nodesRef.current = generateNodes(paddedWidth, paddedHeight)
          timeRef.current = performance.now()
          animationRef.current = requestAnimationFrame(animate)
        }
      }, 100)
      return
    }

    // Add padding for glow effects (40px on each side)
    const paddedWidth = rect.width + 80
    const paddedHeight = rect.height + 80
    nodesRef.current = generateNodes(paddedWidth, paddedHeight)
    timeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(animate)

    // Add mouse event listeners only if interactive
    if (interactive) {
      canvas.addEventListener('mousemove', handleMouseMove, { passive: true })
      canvas.addEventListener('mouseleave', handleMouseLeave, { passive: true })
      canvas.addEventListener('mouseenter', handleMouseMove, { passive: true })
      
      // Also add to window for better tracking
      window.addEventListener('mousemove', handleMouseMove, { passive: true })
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (interactive) {
        canvas.removeEventListener('mousemove', handleMouseMove)
        canvas.removeEventListener('mouseleave', handleMouseLeave)
        canvas.removeEventListener('mouseenter', handleMouseMove)
        window.removeEventListener('mousemove', handleMouseMove)
      }
    }
  }, [containerRef, generateNodes, animate, handleMouseMove, handleMouseLeave, isMobile, interactive, animated, transitionStart, transitionEnd])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ 
        width: '100%', 
        height: '100%',
        pointerEvents: 'auto',
        ...style
      }}
    />
  )
}