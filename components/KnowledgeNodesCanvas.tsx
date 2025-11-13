"use client"

import { useEffect, useRef, useCallback, useState } from 'react'

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
  const connectionColorsRef = useRef<Map<string, string>>(new Map())
  const mouseRef = useRef({ x: 0, y: 0 })
  const timeRef = useRef(0)
  const [isMobile, setIsMobile] = useState(false)
  const isVisibleRef = useRef(true)
  const lastMouseUpdateRef = useRef(0)
  const gradientCacheRef = useRef<Map<string, CanvasGradient>>(new Map())
  const connectionDistanceCacheRef = useRef<Map<string, number>>(new Map())

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
    
    // Calculate transition zone for density variation
    let transitionStartY = 0
    let transitionEndY = 0
    let hasTransition = false
    
    if (transitionStart && transitionEnd && containerRef.current) {
      const viewportHeight = window.innerHeight
      const startOffset = parseFloat(transitionStart.replace('calc(100vh + ', '').replace('px)', ''))
      const endOffset = parseFloat(transitionEnd.replace('calc(100vh + ', '').replace('px)', ''))
      
      transitionStartY = viewportHeight + startOffset
      transitionEndY = viewportHeight + endOffset
      hasTransition = true
    }
    
    // Generate high density nodes for top section (interactive area)
    const topSectionNodes = Math.floor(config.nodeCount * 0.175) // 17.5% of nodes in top section (quarter density)
    
    for (let i = 0; i < topSectionNodes; i++) {
      let attempts = 0
      let validPosition = false
      let x = 0, y = 0
      
      while (!validPosition && attempts < 50) {
        // Keep nodes within boundary distance from edges
        x = Math.random() * (width - 2 * boundaryDistance) + boundaryDistance
        y = Math.random() * (height - 2 * boundaryDistance) + boundaryDistance
        
        // Only place nodes in top section (before transition zone)
        if (hasTransition && y > transitionStartY) {
          attempts++
          continue
        }
        
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
    
    // Generate low density nodes for bottom section (static/blurred area)
    const bottomSectionNodes = Math.floor(config.nodeCount * 0.2) // 20% of total nodes in bottom section
    const bottomMinDistance = 120 // Much larger spacing for bottom section
    
    for (let i = 0; i < bottomSectionNodes; i++) {
      let attempts = 0
      let validPosition = false
      let x = 0, y = 0
      
      while (!validPosition && attempts < 50) {
        // Keep nodes within boundary distance from edges
        x = Math.random() * (width - 2 * boundaryDistance) + boundaryDistance
        y = Math.random() * (height - 2 * boundaryDistance) + boundaryDistance
        
        // Only place nodes in bottom section (after transition zone)
        if (hasTransition && y < transitionEndY) {
          attempts++
          continue
        }
        
        validPosition = true
        for (const node of nodes) {
          const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
          if (distance < bottomMinDistance) {
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
          
          // Assign a consistent color to this connection
          const connectionKey = `${Math.min(i, targetIndex)}-${Math.max(i, targetIndex)}`
          if (!connectionColorsRef.current.has(connectionKey)) {
            const connectionColors = ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784']
            const colorIndex = Math.floor(Math.random() * connectionColors.length)
            connectionColorsRef.current.set(connectionKey, connectionColors[colorIndex])
          }
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
    
    // Calculate transition zone for performance optimization
    let transitionStartY = 0
    let transitionEndY = 0
    let hasTransition = false
    
    if (transitionStart && transitionEnd && containerRef.current) {
      const viewportHeight = window.innerHeight
      const startOffset = parseFloat(transitionStart.replace('calc(100vh + ', '').replace('px)', ''))
      const endOffset = parseFloat(transitionEnd.replace('calc(100vh + ', '').replace('px)', ''))
      
      transitionStartY = viewportHeight + startOffset
      transitionEndY = viewportHeight + endOffset
      hasTransition = true
    }
    
    // Get viewport bounds for culling off-screen elements
    const viewportLeft = -40
    const viewportRight = paddedWidth + 40
    const viewportTop = -40
    const viewportBottom = paddedHeight + 40
    
    // Draw connections with varying opacity and colors (only for interactive sections)
    ctx.lineWidth = 0.8
    ctx.globalAlpha = 0.2
    
    const connectionColors = ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784']
    const mouse = mouseRef.current
    const glowRadiusSquared = 80 * 80
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      // Skip connections for static sections
      if (hasTransition && node.y > transitionEndY) {
        continue
      }
      
      // Skip if node is completely off-screen
      if (node.x < viewportLeft - 100 || node.x > viewportRight + 100 ||
          node.y < viewportTop - 100 || node.y > viewportBottom + 100) {
        continue
      }
      
      for (const connectionIndex of node.connections) {
        const connectedNode = nodes[connectionIndex]
        if (connectedNode) {
          // Skip connections to nodes in static sections
          if (hasTransition && connectedNode.y > transitionEndY) {
            continue
          }
          
          // Skip if connected node is off-screen
          if (connectedNode.x < viewportLeft - 100 || connectedNode.x > viewportRight + 100 ||
              connectedNode.y < viewportTop - 100 || connectedNode.y > viewportBottom + 100) {
            continue
          }
          
          // Calculate cursor proximity for glow effect (optimized)
          const dx = (node.x + connectedNode.x) / 2 - mouse.x
          const dy = (node.y + connectedNode.y) / 2 - mouse.y
          const cursorDistanceSquared = dx * dx + dy * dy
          
          // Get consistent color for this connection
          const connectionKey = `${Math.min(i, connectionIndex)}-${Math.max(i, connectionIndex)}`
          const connectionColor = connectionColorsRef.current.get(connectionKey) || connectionColors[0]
          ctx.strokeStyle = connectionColor
          
          // Add subtle pulsing to connections
          const pulse = Math.sin(timeRef.current * 0.001 + node.x * 0.01) * 0.1 + 0.2
          
          // Enhanced glow when cursor is nearby (subtle)
          if (cursorDistanceSquared < glowRadiusSquared) {
            const glowIntensity = Math.max(0, 1 - Math.sqrt(cursorDistanceSquared) / 80)
            ctx.globalAlpha = pulse + (glowIntensity * 0.15) // Subtle opacity increase
            ctx.lineWidth = 0.8 + (glowIntensity * 0.4) // Subtle line thickness increase
            
            // Subtle glow effect
            ctx.shadowColor = connectionColor
            ctx.shadowBlur = glowIntensity * 6 // Reduced shadow blur
          } else {
            ctx.globalAlpha = pulse
            ctx.lineWidth = 0.8
            ctx.shadowBlur = 0
          }
          
          ctx.beginPath()
          ctx.moveTo(node.x, node.y)
          ctx.lineTo(connectedNode.x, connectedNode.y)
          ctx.stroke()
          
          // Reset shadow
          ctx.shadowBlur = 0
        }
      }
    }
    
    // Draw nodes
    ctx.globalAlpha = 0.9
    const nodeGlowRadiusSquared = 70 * 70
    
    for (const node of nodes) {
      // Skip if node is completely off-screen (with padding for glow)
      if (node.x < viewportLeft - 150 || node.x > viewportRight + 150 ||
          node.y < viewportTop - 150 || node.y > viewportBottom + 150) {
        continue
      }
      
      // Calculate cursor proximity for enhanced glow (optimized)
      const nDx = node.x - mouse.x
      const nDy = node.y - mouse.y
      const cursorDistanceSquared = nDx * nDx + nDy * nDy
      
      // Node glow with pulsing effect
      const pulse = Math.sin(timeRef.current * 0.002 + node.originalX * 0.01) * 0.3 + 0.7
      let glowSize = node.size * 3 * pulse // Base glow size
      
      // Enhanced glow when cursor is nearby (subtle)
      if (cursorDistanceSquared < nodeGlowRadiusSquared) {
        const glowIntensity = Math.max(0, 1 - Math.sqrt(cursorDistanceSquared) / 70)
        glowSize += glowIntensity * node.size * 1.5 // Subtle glow increase
        
        // Subtle shadow glow effect
        ctx.shadowColor = node.color
        ctx.shadowBlur = glowIntensity * 8 // Reduced shadow blur
      } else {
        ctx.shadowBlur = 0
      }
      
      // Cache gradient by key to avoid recreating
      const gradientKey = `${node.x.toFixed(1)}-${node.y.toFixed(1)}-${glowSize.toFixed(1)}-${node.color}`
      let gradient = gradientCacheRef.current.get(gradientKey)
      if (!gradient) {
        gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)
        gradient.addColorStop(0, node.color)
        gradient.addColorStop(0.7, node.color + '40')
        gradient.addColorStop(1, 'transparent')
        // Limit cache size to prevent memory issues
        if (gradientCacheRef.current.size > 100) {
          const firstKey = gradientCacheRef.current.keys().next().value
          gradientCacheRef.current.delete(firstKey)
        }
        gradientCacheRef.current.set(gradientKey, gradient)
      }
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Reset shadow for core
      ctx.shadowBlur = 0
      
      // Node core with size variation
      let coreSize = node.size * (1.0 + Math.sin(timeRef.current * 0.001 + node.originalY * 0.008) * 0.2) // Base core size
      
      // Enhanced core size when cursor is nearby (subtle)
      if (cursorDistanceSquared < nodeGlowRadiusSquared) {
        const glowIntensity = Math.max(0, 1 - Math.sqrt(cursorDistanceSquared) / 70)
        coreSize += glowIntensity * node.size * 0.2 // Subtle core size increase
      }
      
      ctx.fillStyle = node.color
      ctx.beginPath()
      ctx.arc(node.x, node.y, coreSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Node highlight with dynamic positioning
      const highlightOffset = Math.sin(timeRef.current * 0.0015 + node.originalX * 0.012) * 0.2
      const highlightX = node.x - node.size * (0.3 + highlightOffset)
      const highlightY = node.y - node.size * (0.3 + highlightOffset)
      
      // Enhanced highlight when cursor is nearby (subtle)
      let highlightOpacity = 0.4
      let highlightSize = node.size * 0.25
      
      if (cursorDistanceSquared < nodeGlowRadiusSquared) {
        const glowIntensity = Math.max(0, 1 - Math.sqrt(cursorDistanceSquared) / 70)
        highlightOpacity += glowIntensity * 0.15 // Subtle highlight brightness increase
        highlightSize += glowIntensity * node.size * 0.1 // Subtle highlight size increase
      }
      
      ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`
      ctx.beginPath()
      ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Add subtle inner glow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [transitionStart, transitionEnd, containerRef])

  const animate = useCallback((currentTime: number) => {
    // Pause animation when tab is hidden
    if (!isVisibleRef.current) {
      animationRef.current = requestAnimationFrame(animate)
      return
    }
    
    const deltaTime = (currentTime - timeRef.current) / 1000
    timeRef.current = currentTime
    
    updateNodes(deltaTime)
    draw()
    
    animationRef.current = requestAnimationFrame(animate)
  }, [updateNodes, draw])

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!canvasRef.current) return
    
    // Throttle mouse updates to ~60fps (16ms)
    const now = performance.now()
    if (now - lastMouseUpdateRef.current < 16) {
      return
    }
    lastMouseUpdateRef.current = now
    
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
          connectionColorsRef.current.clear()
          gradientCacheRef.current.clear()
          connectionDistanceCacheRef.current.clear()
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
    connectionColorsRef.current.clear()
    gradientCacheRef.current.clear()
    connectionDistanceCacheRef.current.clear()
    nodesRef.current = generateNodes(paddedWidth, paddedHeight)
    timeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(animate)

    // Handle visibility change to pause animation
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    isVisibleRef.current = !document.hidden

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
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
        willChange: 'transform',
        ...style
      }}
    />
  )
}