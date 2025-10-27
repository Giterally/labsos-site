import * as THREE from 'three'
import { KnowledgeNode, Connection, MousePosition, NodeSystemConfig } from './types'

export class NodeSystem {
  private nodes: Map<string, KnowledgeNode> = new Map()
  private connections: Map<string, Connection> = new Map()
  private config: NodeSystemConfig
  private mousePosition: MousePosition = { x: 0, y: 0, worldPosition: new THREE.Vector3() }
  private time = 0

  constructor(config: NodeSystemConfig) {
    this.config = config
  }

  generateNodes(width: number, height: number, isMobile: boolean): KnowledgeNode[] {
    const settings = isMobile ? this.config.mobile : this.config.desktop
    const nodeCount = settings.nodeCount
    
    // Clear existing nodes
    this.nodes.clear()
    this.connections.clear()
    
    // Generate nodes using Poisson disk sampling for even distribution
    const nodes: KnowledgeNode[] = []
    const minDistance = 80
    const maxAttempts = 30
    
    for (let i = 0; i < nodeCount; i++) {
      let attempts = 0
      let validPosition = false
      let position: THREE.Vector3
      
      while (!validPosition && attempts < maxAttempts) {
        position = new THREE.Vector3(
          (Math.random() - 0.5) * width,
          (Math.random() - 0.5) * height,
          0
        )
        
        validPosition = true
        for (const existingNode of nodes) {
          if (position.distanceTo(existingNode.position) < minDistance) {
            validPosition = false
            break
          }
        }
        attempts++
      }
      
      if (validPosition && position!) {
        const node = this.createNode(position, i)
        nodes.push(node)
        this.nodes.set(node.id, node)
      }
    }
    
    // Generate connections
    this.generateConnections()
    
    return nodes
  }

  private createNode(position: THREE.Vector3, index: number): KnowledgeNode {
    const id = `node-${index}`
    const shape = Math.random() < 0.6 ? 'hexagon' : 'circle'
    
    // Determine size tier
    const sizeTier = Math.random()
    let size: number
    if (sizeTier < 0.4) {
      size = this.config.sizes.small.min + Math.random() * (this.config.sizes.small.max - this.config.sizes.small.min)
    } else if (sizeTier < 0.8) {
      size = this.config.sizes.medium.min + Math.random() * (this.config.sizes.medium.max - this.config.sizes.medium.min)
    } else {
      size = this.config.sizes.large.min + Math.random() * (this.config.sizes.large.max - this.config.sizes.large.min)
    }
    
    // Generate color based on theme
    const colorVariation = Math.random()
    let color: THREE.Color
    if (colorVariation < 0.4) {
      color = new THREE.Color(this.config.colors.primary)
    } else if (colorVariation < 0.7) {
      color = new THREE.Color(this.config.colors.secondary)
    } else {
      color = new THREE.Color(this.config.colors.tertiary)
    }
    
    return {
      id,
      position: position.clone(),
      originalPosition: position.clone(),
      velocity: new THREE.Vector3(),
      shape,
      size,
      color,
      connections: [],
      glowIntensity: 0.2 + Math.random() * 0.3,
      pulsePhase: Math.random() * Math.PI * 2
    }
  }

  private generateConnections(): void {
    const nodes = Array.from(this.nodes.values())
    
    for (const node of nodes) {
      const nearbyNodes = nodes.filter(otherNode => 
        otherNode.id !== node.id && 
        node.position.distanceTo(otherNode.position) <= this.config.connections.maxDistance
      )
      
      // Sort by distance and take closest nodes
      nearbyNodes.sort((a, b) => 
        node.position.distanceTo(a.position) - node.position.distanceTo(b.position)
      )
      
      // Connect to up to maxConnectionsPerNode nearby nodes
      const connectionsToMake = Math.min(
        this.config.connections.maxConnectionsPerNode,
        nearbyNodes.length
      )
      
      for (let i = 0; i < connectionsToMake; i++) {
        const targetNode = nearbyNodes[i]
        
        // Avoid duplicate connections
        if (!node.connections.includes(targetNode.id) && 
            !targetNode.connections.includes(node.id)) {
          
          const connectionId = `${node.id}-${targetNode.id}`
          const connection = this.createConnection(node, targetNode, connectionId)
          
          this.connections.set(connectionId, connection)
          node.connections.push(targetNode.id)
          targetNode.connections.push(node.id)
        }
      }
    }
  }

  private createConnection(fromNode: KnowledgeNode, toNode: KnowledgeNode, id: string): Connection {
    const fromPos = fromNode.position.clone()
    const toPos = toNode.position.clone()
    
    // Create control points for smooth bezier curve
    const direction = toPos.clone().sub(fromPos)
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize()
    
    const controlPoint1 = fromPos.clone().add(perpendicular.clone().multiplyScalar(direction.length() * 0.3))
    const controlPoint2 = toPos.clone().add(perpendicular.clone().multiplyScalar(-direction.length() * 0.3))
    
    return {
      id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      fromPosition: fromPos,
      toPosition: toPos,
      controlPoint1,
      controlPoint2,
      opacity: this.config.connections.opacity,
      pulsePhase: Math.random() * Math.PI * 2
    }
  }

  updateMousePosition(mouseX: number, mouseY: number, camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    this.mousePosition.x = mouseX
    this.mousePosition.y = mouseY
    
    // Convert screen coordinates to world coordinates
    const vector = new THREE.Vector3()
    vector.set(
      (mouseX / renderer.domElement.clientWidth) * 2 - 1,
      -(mouseY / renderer.domElement.clientHeight) * 2 + 1,
      0.5
    )
    
    vector.unproject(camera)
    const dir = vector.sub(camera.position).normalize()
    const distance = -camera.position.z / dir.z
    const pos = camera.position.clone().add(dir.multiplyScalar(distance))
    
    this.mousePosition.worldPosition = pos
  }

  updatePhysics(deltaTime: number): void {
    this.time += deltaTime
    
    for (const node of this.nodes.values()) {
      // Calculate repulsion from mouse
      const mouseDistance = node.position.distanceTo(this.mousePosition.worldPosition)
      const repulsionForce = new THREE.Vector3()
      
      if (mouseDistance < this.config.physics.repulsionRadius) {
        const direction = node.position.clone().sub(this.mousePosition.worldPosition).normalize()
        const strength = Math.pow((this.config.physics.repulsionRadius - mouseDistance) / this.config.physics.repulsionRadius, 2)
        repulsionForce.copy(direction.multiplyScalar(strength * this.config.physics.repulsionStrength))
      }
      
      // Calculate spring force back to original position
      const springForce = node.originalPosition.clone().sub(node.position).multiplyScalar(this.config.physics.springStrength)
      
      // Apply forces
      const totalForce = repulsionForce.add(springForce)
      node.velocity.add(totalForce.multiplyScalar(deltaTime))
      
      // Apply damping
      node.velocity.multiplyScalar(1 - this.config.physics.springDamping)
      
      // Limit velocity
      if (node.velocity.length() > this.config.physics.maxVelocity) {
        node.velocity.normalize().multiplyScalar(this.config.physics.maxVelocity)
      }
      
      // Update position
      node.position.add(node.velocity.clone().multiplyScalar(deltaTime))
      
      // Update glow intensity based on distance from mouse
      const glowDistance = Math.min(mouseDistance / this.config.physics.repulsionRadius, 1)
      node.glowIntensity = 0.2 + (1 - glowDistance) * 0.3
    }
    
    // Update connections
    for (const connection of this.connections.values()) {
      const fromNode = this.nodes.get(connection.fromNodeId)
      const toNode = this.nodes.get(connection.toNodeId)
      
      if (fromNode && toNode) {
        connection.fromPosition.copy(fromNode.position)
        connection.toPosition.copy(toNode.position)
        
        // Update control points
        const direction = connection.toPosition.clone().sub(connection.fromPosition)
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize()
        
        connection.controlPoint1.copy(connection.fromPosition).add(perpendicular.clone().multiplyScalar(direction.length() * 0.3))
        connection.controlPoint2.copy(connection.toPosition).add(perpendicular.clone().multiplyScalar(-direction.length() * 0.3))
      }
    }
  }

  getNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values())
  }

  getConnections(): Connection[] {
    return Array.from(this.connections.values())
  }

  getTime(): number {
    return this.time
  }
}
