import * as THREE from 'three'

export interface KnowledgeNode {
  id: string
  position: THREE.Vector3
  originalPosition: THREE.Vector3
  velocity: THREE.Vector3
  shape: 'hexagon' | 'circle'
  size: number
  color: THREE.Color
  connections: string[] // IDs of connected nodes
  glowIntensity: number
  pulsePhase: number
}

export interface Particle {
  id: string
  position: THREE.Vector3
  velocity: THREE.Vector3
  targetPosition: THREE.Vector3
  progress: number // 0-1 along connection path
  connectionId: string
  life: number // 0-1 for fade in/out
  size: number
  color: THREE.Color
}

export interface Connection {
  id: string
  fromNodeId: string
  toNodeId: string
  fromPosition: THREE.Vector3
  toPosition: THREE.Vector3
  controlPoint1: THREE.Vector3
  controlPoint2: THREE.Vector3
  opacity: number
  pulsePhase: number
}

export interface MousePosition {
  x: number
  y: number
  worldPosition: THREE.Vector3
}

export interface PerformanceSettings {
  nodeCount: number
  particleCount: number
  enableGlow: boolean
  enableParticles: boolean
  resolutionScale: number
}

export interface NodeSystemConfig {
  desktop: PerformanceSettings
  mobile: PerformanceSettings
  physics: {
    repulsionRadius: number
    repulsionStrength: number
    springDamping: number
    springStrength: number
    maxVelocity: number
  }
  colors: {
    primary: string
    secondary: string
    tertiary: string
    glow: string
  }
  sizes: {
    small: { min: number; max: number }
    medium: { min: number; max: number }
    large: { min: number; max: number }
  }
  connections: {
    maxDistance: number
    maxConnectionsPerNode: number
    dashLength: number
    dashGap: number
    opacity: number
  }
  particles: {
    size: number
    speed: number
    lifeDuration: number
    fadeInDuration: number
    fadeOutDuration: number
  }
}
