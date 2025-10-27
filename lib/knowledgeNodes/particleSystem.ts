import * as THREE from 'three'
import { Particle, Connection, NodeSystemConfig } from './types'

export class ParticleSystem {
  private particles: Map<string, Particle> = new Map()
  private particlePool: Particle[] = []
  private config: NodeSystemConfig
  private time = 0
  private nextParticleId = 0

  constructor(config: NodeSystemConfig) {
    this.config = config
    this.initializeParticlePool()
  }

  private initializeParticlePool(): void {
    const maxParticles = this.config.desktop.particleCount
    for (let i = 0; i < maxParticles; i++) {
      this.particlePool.push(this.createEmptyParticle())
    }
  }

  private createEmptyParticle(): Particle {
    return {
      id: '',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      progress: 0,
      connectionId: '',
      life: 0,
      size: this.config.particles.size,
      color: new THREE.Color()
    }
  }

  private createParticle(connection: Connection): Particle | null {
    if (this.particlePool.length === 0) return null
    
    const particle = this.particlePool.pop()!
    particle.id = `particle-${this.nextParticleId++}`
    particle.position.copy(connection.fromPosition)
    particle.targetPosition.copy(connection.toPosition)
    particle.connectionId = connection.id
    particle.progress = 0
    particle.life = 0
    particle.size = this.config.particles.size + Math.random() * 0.5
    
    // Random color variation
    const colorVariation = Math.random()
    if (colorVariation < 0.3) {
      particle.color.setHex(0x1B5E20) // Primary green
    } else if (colorVariation < 0.6) {
      particle.color.setHex(0x2E7D32) // Secondary green
    } else {
      particle.color.setHex(0x4FC3F7) // Light blue
    }
    
    return particle
  }

  spawnParticles(connections: Connection[]): void {
    const activeConnections = connections.filter(conn => 
      this.getParticleCountForConnection(conn.id) < 2 // Max 2 particles per connection
    )
    
    for (const connection of activeConnections) {
      if (Math.random() < 0.1) { // 10% chance per frame to spawn particle
        const particle = this.createParticle(connection)
        if (particle) {
          this.particles.set(particle.id, particle)
        }
      }
    }
  }

  private getParticleCountForConnection(connectionId: string): number {
    let count = 0
    for (const particle of this.particles.values()) {
      if (particle.connectionId === connectionId) {
        count++
      }
    }
    return count
  }

  updateParticles(deltaTime: number, connections: Connection[]): void {
    this.time += deltaTime
    
    // Update existing particles
    const particlesToRemove: string[] = []
    
    for (const particle of this.particles.values()) {
      const connection = connections.find(conn => conn.id === particle.connectionId)
      if (!connection) {
        particlesToRemove.push(particle.id)
        continue
      }
      
      // Update progress along bezier curve
      particle.progress += deltaTime * this.config.particles.speed
      
      if (particle.progress >= 1) {
        // Particle reached end, remove it
        particlesToRemove.push(particle.id)
        continue
      }
      
      // Calculate position along bezier curve
      const t = particle.progress
      const t2 = t * t
      const t3 = t2 * t
      const mt = 1 - t
      const mt2 = mt * mt
      const mt3 = mt2 * mt
      
      particle.position.x = mt3 * connection.fromPosition.x + 
                           3 * mt2 * t * connection.controlPoint1.x + 
                           3 * mt * t2 * connection.controlPoint2.x + 
                           t3 * connection.toPosition.x
      
      particle.position.y = mt3 * connection.fromPosition.y + 
                           3 * mt2 * t * connection.controlPoint1.y + 
                           3 * mt * t2 * connection.controlPoint2.y + 
                           t3 * connection.toPosition.y
      
      particle.position.z = mt3 * connection.fromPosition.z + 
                           3 * mt2 * t * connection.controlPoint1.z + 
                           3 * mt * t2 * connection.controlPoint2.z + 
                           t3 * connection.toPosition.z
      
      // Update life cycle
      if (particle.progress < this.config.particles.fadeInDuration) {
        // Fade in
        particle.life = particle.progress / this.config.particles.fadeInDuration
      } else if (particle.progress > 1 - this.config.particles.fadeOutDuration) {
        // Fade out
        particle.life = (1 - particle.progress) / this.config.particles.fadeOutDuration
      } else {
        // Full life
        particle.life = 1
      }
      
      // Add gentle floating motion
      particle.position.y += Math.sin(this.time * 2 + particle.id.length) * 0.5
    }
    
    // Remove finished particles
    for (const particleId of particlesToRemove) {
      const particle = this.particles.get(particleId)
      if (particle) {
        this.particlePool.push(particle)
        this.particles.delete(particleId)
      }
    }
    
    // Spawn new particles
    this.spawnParticles(connections)
  }

  getParticles(): Particle[] {
    return Array.from(this.particles.values())
  }

  setParticleCount(count: number): void {
    // Adjust particle pool size based on performance settings
    const currentCount = this.particlePool.length
    if (count > currentCount) {
      // Add more particles to pool
      for (let i = currentCount; i < count; i++) {
        this.particlePool.push(this.createEmptyParticle())
      }
    } else if (count < currentCount) {
      // Remove particles from pool
      this.particlePool.splice(count, currentCount - count)
    }
  }

  getTime(): number {
    return this.time
  }
}
