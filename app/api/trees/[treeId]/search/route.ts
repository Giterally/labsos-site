import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface SearchResult {
  id: string
  type: 'block' | 'node' | 'attachment' | 'link' | 'content'
  title: string
  description?: string
  content?: string
  nodeType?: string
  nodeId?: string
  nodeTitle?: string
  blockId?: string
  blockName?: string
  path: string[]
  matchType: 'title' | 'description' | 'content' | 'attachment' | 'link' | 'block'
  score: number
  sectionName?: string
  sectionId?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const searchQuery = query.trim().toLowerCase()
    
    // Create search terms for better matching
    const searchTerms = searchQuery.split(/\s+/).filter(term => term.length > 0)
    const hasMultipleTerms = searchTerms.length > 1

    // Get tree info and blocks first
    const { data: treeInfo, error: treeError } = await supabase
      .from('experiment_trees')
      .select('name, description')
      .eq('id', treeId)
      .single()

    if (treeError) {
      console.error('Error fetching tree info:', treeError)
      return NextResponse.json({ error: 'Failed to fetch tree info' }, { status: 500 })
    }

    // Get custom blocks
    const { data: customBlocks, error: blocksError } = await supabase
      .from('custom_blocks')
      .select('*')
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (blocksError) {
      console.error('Error fetching blocks:', blocksError)
    }

    // Get all nodes with their content, attachments, and links
    const { data: nodes, error: nodesError } = await supabase
      .from('tree_nodes')
      .select(`
        *,
        node_content (
          id,
          content,
          status,
          created_at,
          updated_at
        ),
        node_attachments (
          id,
          name,
          file_type,
          file_size,
          file_url,
          description,
          created_at,
          updated_at
        ),
        node_links (
          id,
          name,
          url,
          description,
          link_type,
          created_at,
          updated_at
        )
      `)
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (nodesError) {
      console.error('Error fetching nodes for search:', nodesError)
      return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 })
    }

    const results: SearchResult[] = []

    // Search in tree name and description
    if (matchesSearchTerms(treeInfo.name, searchTerms)) {
      results.push({
        id: `tree-name-${treeId}`,
        type: 'block',
        title: treeInfo.name,
        description: treeInfo.description || 'Experiment Tree',
        blockId: treeId,
        blockName: treeInfo.name,
        path: ['Tree'],
        matchType: 'title',
        score: 200
      })
    }

    // Search in custom blocks
    customBlocks?.forEach(block => {
      const blockName = block.name || ''
      const blockDescription = block.description || ''
      const searchText = blockName + ' ' + blockDescription

      if (matchesSearchTerms(searchText, searchTerms)) {
        results.push({
          id: `block-${block.id}`,
          type: 'block',
          title: blockName,
          description: blockDescription || `Block: ${block.block_type}`,
          blockId: block.id,
          blockName: blockName,
          nodeType: block.block_type,
          path: ['Blocks'],
          matchType: 'block',
          score: calculateScore(searchText, searchQuery, 'block')
        })
      }
    })

    // Search in default block types
    const defaultBlocks = ['protocol', 'data_creation', 'analysis', 'results']
    defaultBlocks.forEach(blockType => {
      const blockName = getBlockDisplayName(blockType)
      if (matchesSearchTerms(blockName, searchTerms)) {
        results.push({
          id: `default-block-${blockType}`,
          type: 'block',
          title: blockName,
          description: `Default ${blockType} block`,
          blockId: blockType,
          blockName: blockName,
          nodeType: blockType,
          path: ['Blocks'],
          matchType: 'block',
          score: calculateScore(blockName, searchQuery, 'block')
        })
      }
    })

    // Create a mapping from block IDs to block names
    const blockIdToName = new Map()
    customBlocks?.forEach(block => {
      blockIdToName.set(block.id, block.name)
    })

    // Search through each node
    nodes.forEach(node => {
      const nodeTitle = node.name || 'Untitled Node'
      const nodeDescription = node.description || ''
      const nodeContent = node.node_content?.[0]?.content || ''
      const nodeType = node.node_type
      
      // Get block name - if node_type is a UUID, look it up in custom blocks
      // Otherwise, use the default block type mapping
      let blockName
      if (nodeType && nodeType.length > 20) { // Likely a UUID
        blockName = blockIdToName.get(nodeType) || getBlockDisplayName(nodeType)
      } else {
        blockName = getBlockDisplayName(nodeType)
      }

      // Search in node title
      if (matchesSearchTerms(nodeTitle, searchTerms)) {
        results.push({
          id: `node-title-${node.id}`,
          type: 'node',
          title: nodeTitle,
          description: nodeDescription,
          nodeType: blockName, // Use the human-readable block name instead of UUID
          nodeId: node.id,
          nodeTitle: nodeTitle,
          blockName: blockName,
          path: [blockName, nodeTitle],
          matchType: 'title',
          score: calculateScore(nodeTitle, searchQuery, 'title')
        })
      }

      // Search in node description
      if (matchesSearchTerms(nodeDescription, searchTerms)) {
        results.push({
          id: `node-description-${node.id}`,
          type: 'content',
          title: nodeTitle,
          description: nodeDescription,
          content: nodeDescription,
          nodeType: blockName,
          nodeId: node.id,
          nodeTitle: nodeTitle,
          blockName: blockName,
          path: [blockName, nodeTitle],
          matchType: 'description',
          score: calculateScore(nodeDescription, searchQuery, 'description')
        })
      }

      // Search in node content with granular section matching
      if (matchesSearchTerms(nodeContent, searchTerms)) {
        const contentSnippet = extractSnippet(nodeContent, searchQuery)
        
        // Try to identify which section the match is in
        const sections = extractContentSections(nodeContent, searchQuery)
        
        if (sections.length > 0) {
          // Create a result for each matching section
          sections.forEach((section, index) => {
            results.push({
              id: `node-content-${node.id}-${index}`,
              type: 'content',
              title: nodeTitle,
              description: `Content match in ${section.sectionName}`,
              content: section.snippet,
              nodeType: blockName,
              nodeId: node.id,
              nodeTitle: nodeTitle,
              blockName: blockName,
              path: [blockName, nodeTitle, section.sectionName],
              matchType: 'content',
              score: calculateScore(section.snippet, searchQuery, 'content'),
              sectionName: section.sectionName,
              sectionId: section.sectionId
            })
          })
        } else {
          // Fallback to general content match
          results.push({
            id: `node-content-${node.id}`,
            type: 'content',
            title: nodeTitle,
            description: 'Content match',
            content: contentSnippet,
            nodeType: blockName,
            nodeId: node.id,
            nodeTitle: nodeTitle,
            blockName: blockName,
            path: [blockName, nodeTitle, 'Content'],
            matchType: 'content',
            score: calculateScore(nodeContent, searchQuery, 'content')
          })
        }
      }

      // Search in attachments
      node.node_attachments?.forEach(attachment => {
        const attachmentName = attachment.name || ''
        const attachmentDescription = attachment.description || ''
        const searchText = attachmentName + ' ' + attachmentDescription

        if (matchesSearchTerms(searchText, searchTerms)) {
          results.push({
            id: `attachment-${attachment.id}`,
            type: 'attachment',
            title: attachmentName,
            description: attachmentDescription || `File: ${attachment.file_type}`,
            nodeType: blockName,
            nodeId: node.id,
            nodeTitle: nodeTitle,
            blockName: blockName,
            path: [blockName, nodeTitle, 'Attachments'],
            matchType: 'attachment',
            score: calculateScore(searchText, searchQuery, 'attachment'),
            sectionName: 'Attachments',
            sectionId: 'attachments'
          })
        }
      })

      // Search in links
      node.node_links?.forEach(link => {
        const linkName = link.name || ''
        const linkDescription = link.description || ''
        const linkUrl = link.url || ''
        const searchText = linkName + ' ' + linkDescription + ' ' + linkUrl

        if (matchesSearchTerms(searchText, searchTerms)) {
          results.push({
            id: `link-${link.id}`,
            type: 'link',
            title: linkName,
            description: linkDescription || linkUrl,
            nodeType: blockName,
            nodeId: node.id,
            nodeTitle: nodeTitle,
            blockName: blockName,
            path: [blockName, nodeTitle, 'Links'],
            matchType: 'link',
            score: calculateScore(searchText, searchQuery, 'link'),
            sectionName: 'Links',
            sectionId: 'links'
          })
        }
      })
    })

    // Sort results by score (highest first) and remove duplicates
    const uniqueResults = results
      .filter((result, index, self) => 
        index === self.findIndex(r => r.id === result.id)
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 20) // Limit to top 20 results

    return NextResponse.json({ results: uniqueResults })
  } catch (error) {
    console.error('Error in search API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Get display name for block types
function getBlockDisplayName(blockType: string): string {
  switch (blockType) {
    case 'protocol':
      return 'Protocols'
    case 'data_creation':
      return 'Data Collection & Preparation'
    case 'analysis':
      return 'Analysis'
    case 'results':
      return 'Results'
    default:
      return blockType.charAt(0).toUpperCase() + blockType.slice(1).replace('_', ' ')
  }
}

// Check if text matches search terms
function matchesSearchTerms(text: string, searchTerms: string[]): boolean {
  const lowerText = text.toLowerCase()
  
  if (searchTerms.length === 1) {
    return lowerText.includes(searchTerms[0])
  }
  
  // For multiple terms, all terms must be found
  return searchTerms.every(term => lowerText.includes(term))
}

// Calculate search score based on match type and position
function calculateScore(text: string, query: string, matchType: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  let score = 0
  
  // Base score by match type
  switch (matchType) {
    case 'block':
      score = 150
      break
    case 'title':
      score = 100
      break
    case 'description':
      score = 80
      break
    case 'content':
      score = 60
      break
    case 'attachment':
      score = 40
      break
    case 'link':
      score = 30
      break
    default:
      score = 10
  }
  
  // Boost score for exact matches
  if (lowerText === lowerQuery) {
    score += 50
  } else if (lowerText.startsWith(lowerQuery)) {
    score += 30
  } else if (lowerText.includes(lowerQuery)) {
    score += 10
  }
  
  // Boost score for shorter text (more specific matches)
  if (text.length < 50) {
    score += 20
  } else if (text.length < 100) {
    score += 10
  }
  
  return score
}

// Extract a snippet around the search query
function extractSnippet(content: string, query: string, maxLength: number = 150): string {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const queryIndex = lowerContent.indexOf(lowerQuery)
  
  if (queryIndex === -1) {
    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '')
  }
  
  const start = Math.max(0, queryIndex - 50)
  const end = Math.min(content.length, queryIndex + query.length + 50)
  
  let snippet = content.substring(start, end)
  
  if (start > 0) {
    snippet = '...' + snippet
  }
  if (end < content.length) {
    snippet = snippet + '...'
  }
  
  return snippet
}

// Extract content sections that match the search query
function extractContentSections(content: string, query: string): Array<{sectionName: string, sectionId: string, snippet: string}> {
  const sections: Array<{sectionName: string, sectionId: string, snippet: string}> = []
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  // Look for matches in different sections
  const lines = content.split('\n')
  let currentSection = 'Content'
  let currentSectionId = 'content'
  let sectionContent = ''
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Check if this line is a section header (markdown headers)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      // Save previous section if it contains the query
      if (sectionContent.toLowerCase().includes(lowerQuery)) {
        const snippet = extractSnippet(sectionContent, query, 150)
        sections.push({
          sectionName: currentSection,
          sectionId: currentSectionId,
          snippet: snippet
        })
      }
      
      // Start new section
      currentSection = headerMatch[2].trim()
      currentSectionId = currentSection.toLowerCase().replace(/[^a-z0-9]/g, '-')
      sectionContent = line + '\n'
    } else {
      sectionContent += line + '\n'
    }
  }
  
  // Check the last section
  if (sectionContent.toLowerCase().includes(lowerQuery)) {
    const snippet = extractSnippet(sectionContent, query, 150)
    sections.push({
      sectionName: currentSection,
      sectionId: currentSectionId,
      snippet: snippet
    })
  }
  
  return sections
}
