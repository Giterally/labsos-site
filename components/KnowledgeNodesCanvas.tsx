"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'

interface KnowledgeNodesCanvasProps {
  containerRef: React.RefObject<HTMLDivElement>
  className?: string
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

export function KnowledgeNodesCanvas({ containerRef, className = "" }: KnowledgeNodesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const nodesRef = useRef<Node[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const timeRef = useRef(0)
  const [isMobile, setIsMobile] = useState(false)

  // Configuration
  const config = {
    nodeCount: isMobile ? 60 : 120, // Much higher density
    particleCount: isMobile ? 120 : 200,
    repulsionRadius: 140, // Increased radius for more interaction area
    repulsionStrength: 0.5, // Increased from 0.3 for more responsive movement
    springStrength: 0.08, // Increased from 0.05 for faster return
    colors: ['#1B5E20', '#2E7D32', '#4FC3F7', '#81C784', '#A5D6A7', '#66BB6A', '#26A69A', '#42A5F5', '#29B6F6', '#5C6BC0']
  }

  const generateNodes = useCallback((width: number, height: number): Node[] => {
    const nodes: Node[] = []
    const minDistance = 35 // Even tighter packing for maximum density
    
    for (let i = 0; i < config.nodeCount; i++) {
      let attempts = 0
      let validPosition = false
      let x = 0, y = 0
      
      while (!validPosition && attempts < 50) {
        x = Math.random() * width
        y = Math.random() * height
        
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
          size: 2.5 + Math.random() * 4, // Even smaller for maximum density
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
          if (distance < 250) { // Increased connection range for more connections
            nearbyNodes.push({ index: j, distance })
          }
        }
      }
      
      // Sort by distance and connect to many more nodes
      nearbyNodes.sort((a, b) => a.distance - b.distance)
      const maxConnections = Math.min(12, nearbyNodes.length) // Up to 12 connections per node
      const connectionsToMake = Math.min(maxConnections, Math.floor(Math.random() * 6) + 6) // 6-12 connections
      
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
    
    for (const node of nodes) {
      // Calculate repulsion from mouse
      const dx = node.x - mouse.x
      const dy = node.y - mouse.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < config.repulsionRadius && distance > 0) {
        // Use quadratic falloff for more dramatic response near cursor
        const force = Math.pow((config.repulsionRadius - distance) / config.repulsionRadius, 1.5)
        const angle = Math.atan2(dy, dx)
        
        node.vx += Math.cos(angle) * force * config.repulsionStrength * 120 // Even higher multiplier
        node.vy += Math.sin(angle) * force * config.repulsionStrength * 120
      }
      
      // Spring force back to original position
      const springDx = node.originalX - node.x
      const springDy = node.originalY - node.y
      
      node.vx += springDx * config.springStrength * 120 // Increased from 100
      node.vy += springDy * config.springStrength * 120
      
      // Enhanced ambient movement - always active but reduced near mouse
      const mouseDistance = Math.sqrt((node.x - mouse.x) ** 2 + (node.y - mouse.y) ** 2)
      const ambientStrength = mouseDistance > config.repulsionRadius ? 1.0 : Math.max(0.2, mouseDistance / config.repulsionRadius)
      
      // Multiple wave patterns for complex ambient movement
      const wave1 = Math.sin(time * 0.0008 + node.originalX * 0.008) * 0.8
      const wave2 = Math.cos(time * 0.0012 + node.originalY * 0.012) * 0.6
      const wave3 = Math.sin(time * 0.0006 + (node.originalX + node.originalY) * 0.01) * 0.4
      
      // Perpendicular movement for circular patterns
      const perpWave1 = Math.cos(time * 0.0009 + node.originalX * 0.009) * 0.5
      const perpWave2 = Math.sin(time * 0.0011 + node.originalY * 0.011) * 0.3
      
      // Apply ambient movement
      node.vx += (wave1 + wave3) * ambientStrength * 0.4
      node.vy += (wave2 + perpWave1) * ambientStrength * 0.4
      node.vx += perpWave2 * ambientStrength * 0.2
      node.vy += wave1 * ambientStrength * 0.2
      
      // Apply damping - reduced for more responsive movement
      node.vx *= 0.82 // Reduced from 0.88
      node.vy *= 0.82
      
      // Update position
      node.x += node.vx * deltaTime
      node.y += node.vy * deltaTime
    }
  }, [config])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    
    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height)
    
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
          for (let p = 0; p < 6; p++) {
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
      const glowSize = node.size * 2 * pulse
      
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)
      gradient.addColorStop(0, node.color)
      gradient.addColorStop(0.7, node.color + '40')
      gradient.addColorStop(1, 'transparent')
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2)
      ctx.fill()
      
      // Node core with size variation
      const coreSize = node.size * (0.8 + Math.sin(timeRef.current * 0.001 + node.originalY * 0.008) * 0.2)
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
    mouseRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
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
          nodesRef.current = generateNodes(newRect.width, newRect.height)
          timeRef.current = performance.now()
          animationRef.current = requestAnimationFrame(animate)
        }
      }, 100)
      return
    }

    nodesRef.current = generateNodes(rect.width, rect.height)
    timeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(animate)

    // Add mouse event listeners
    canvas.addEventListener('mousemove', handleMouseMove, { passive: true })
    canvas.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    canvas.addEventListener('mouseenter', handleMouseMove, { passive: true })
    
    // Also add to window for better tracking
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('mouseenter', handleMouseMove)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [containerRef, generateNodes, animate, handleMouseMove, handleMouseLeave, isMobile])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ 
        width: '100%', 
        height: '100%',
        pointerEvents: 'auto'
      }}
    />
  )
}