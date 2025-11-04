import { ExtractedNode } from '../ai/schemas/workflow-extraction-schema';

/**
 * Extract dependencies between nodes using rule-based pattern matching
 * This is fast and free, but may miss implicit dependencies
 */
export function extractDependenciesRuleBased(nodes: ExtractedNode[]): void {
  console.log(`[DEPENDENCY_EXTRACTOR] Extracting dependencies using rule-based patterns for ${nodes.length} nodes`);

  // Build index of node titles for fuzzy matching
  const nodeTitleIndex = nodes.map(n => ({
    id: n.nodeId,
    title: n.title.toLowerCase(),
    fullTitle: n.title,
  }));

  let dependencyCount = 0;

  for (const node of nodes) {
    const contentLower = node.content.text.toLowerCase();

    // Pattern 1: "from step X" or "from Step X"
    const stepRefs = contentLower.match(/from step\s+(\d+)/gi);
    if (stepRefs) {
      for (const ref of stepRefs) {
        const stepNum = parseInt(ref.match(/\d+/)?.[0] || '0');
        if (stepNum > 0) {
          let referencedNode: ExtractedNode | undefined = undefined;
          let matchedVia = 'none';
          let confidence = 0.5;

          // Strategy 1: Title match with step number (exact)
          referencedNode = nodes.find(n =>
            n.title.match(new RegExp(`^${stepNum}[\\.:]`, 'i'))
          );
          if (referencedNode) {
            matchedVia = 'title_exact';
            confidence = 0.95;
          }

          // Strategy 2: Title match with "step X" pattern
          if (!referencedNode) {
            referencedNode = nodes.find(n =>
              n.title.match(new RegExp(`step\\s+${stepNum}`, 'i'))
            );
            if (referencedNode) {
              matchedVia = 'title_regex';
              confidence = 0.85;
            }
          }

          // Strategy 3: Position-based fallback (assuming extraction order = step order)
          if (!referencedNode && stepNum > 0 && stepNum <= nodes.length) {
            referencedNode = nodes[stepNum - 1];
            if (referencedNode) {
              matchedVia = 'position';
              confidence = 0.7;
              console.log(`[DEPENDENCY_EXTRACTOR] Using position fallback for step ${stepNum}`);
            }
          }

          // Strategy 4: Content search (if node mentions "step X")
          if (!referencedNode) {
            referencedNode = nodes.find(n => {
              const contentMatch = n.content.text.match(new RegExp(`(step|procedure)\\s+${stepNum}[\\.:]?`, 'i'));
              return contentMatch !== null;
            });
            if (referencedNode) {
              matchedVia = 'content_search';
              confidence = 0.6;
              console.log(`[DEPENDENCY_EXTRACTOR] Found step ${stepNum} via content search`);
            }
          }

          if (!referencedNode) {
            console.warn(`[DEPENDENCY_EXTRACTOR] Could not find node for "step ${stepNum}" reference in node "${node.title}"`);
          }

          if (referencedNode && referencedNode.nodeId !== node.nodeId) {
            // Check if dependency already exists
            const exists = node.dependencies.some(d =>
              d.referencedNodeTitle === referencedNode.title
            );

            if (!exists) {
              node.dependencies.push({
                referencedNodeTitle: referencedNode.title,
                dependencyType: 'uses_output',
                extractedPhrase: ref,
                confidence: confidence,
                matchedVia: matchedVia,
              });
              dependencyCount++;
            }
          }
        }
      }
    }

    // Pattern 2: "using the X prepared above/earlier/previously"
    const preparationRefs = contentLower.match(/using the (.+?) prepared (above|earlier|previously)/gi);
    if (preparationRefs) {
      for (const ref of preparationRefs) {
        const itemMatch = ref.match(/using the (.+?) prepared/i);
        if (itemMatch) {
          const itemName = itemMatch[1].trim();
          
          // Search for nodes that prepare this item
          const referencedNode = nodeTitleIndex.find(n =>
            n.title.includes(itemName.toLowerCase()) ||
            n.title.includes(itemName.split(' ')[0].toLowerCase())
          );

          if (referencedNode && referencedNode.id !== node.nodeId) {
            const fullNode = nodes.find(n => n.nodeId === referencedNode.id);
            if (fullNode) {
              const exists = node.dependencies.some(d =>
                d.referencedNodeTitle === fullNode.title
              );

              if (!exists) {
                node.dependencies.push({
                  referencedNodeTitle: fullNode.title,
                  dependencyType: 'requires',
                  extractedPhrase: ref,
                });
                dependencyCount++;
              }
            }
          }
        }
      }
    }

    // Pattern 3: "after X" or "following X"
    const sequenceRefs = contentLower.match(/(after|following)\s+([^.,]+?)([,.])/gi);
    if (sequenceRefs) {
      for (const ref of sequenceRefs) {
        const match = ref.match(/(after|following)\s+(.+?)([,.])/i);
        if (match) {
          const referencedText = match[2].trim();
          
          // Fuzzy match to node titles
          const referencedNode = nodeTitleIndex.find(n =>
            referencedText.toLowerCase().includes(n.title) ||
            n.title.includes(referencedText.toLowerCase().split(' ')[0])
          );

          if (referencedNode && referencedNode.id !== node.nodeId) {
            const fullNode = nodes.find(n => n.nodeId === referencedNode.id);
            if (fullNode) {
              const exists = node.dependencies.some(d =>
                d.referencedNodeTitle === fullNode.title
              );

              if (!exists) {
                node.dependencies.push({
                  referencedNodeTitle: fullNode.title,
                  dependencyType: 'follows',
                  extractedPhrase: ref,
                });
                dependencyCount++;
              }
            }
          }
        }
      }
    }

    // Pattern 4: "see X" or "refer to X"
    const referenceRefs = contentLower.match(/(see|refer to|reference)\s+([^.,]+?)([,.])/gi);
    if (referenceRefs) {
      for (const ref of referenceRefs) {
        const match = ref.match(/(see|refer to|reference)\s+(.+?)([,.])/i);
        if (match) {
          const referencedText = match[2].trim();
          
          // Fuzzy match to node titles
          const referencedNode = nodeTitleIndex.find(n =>
            referencedText.toLowerCase().includes(n.title) ||
            n.title.includes(referencedText.toLowerCase().split(' ')[0])
          );

          if (referencedNode && referencedNode.id !== node.nodeId) {
            const fullNode = nodes.find(n => n.nodeId === referencedNode.id);
            if (fullNode) {
              const exists = node.dependencies.some(d =>
                d.referencedNodeTitle === fullNode.title
              );

              if (!exists) {
                node.dependencies.push({
                  referencedNodeTitle: fullNode.title,
                  dependencyType: 'validates',
                  extractedPhrase: ref,
                });
                dependencyCount++;
              }
            }
          }
        }
      }
    }

    // Pattern 5: "using X from step Y" or "using X from Y"
    const usingFromRefs = contentLower.match(/using\s+([^,]+?)\s+from\s+(step\s+)?(\d+|[^,]+?)([,.])/gi);
    if (usingFromRefs) {
      for (const ref of usingFromRefs) {
        const match = ref.match(/using\s+([^,]+?)\s+from\s+(step\s+)?(\d+|[^,]+?)([,.])/i);
        if (match) {
          const sourceText = match[3].trim();
          
          // Try numeric step first
          if (/^\d+$/.test(sourceText)) {
            const stepNum = parseInt(sourceText);
            const referencedNode = nodes.find(n =>
              n.title.match(new RegExp(`^${stepNum}[.:]`, 'i'))
            );

            if (referencedNode && referencedNode.nodeId !== node.nodeId) {
              const exists = node.dependencies.some(d =>
                d.referencedNodeTitle === referencedNode.title
              );

              if (!exists) {
                node.dependencies.push({
                  referencedNodeTitle: referencedNode.title,
                  dependencyType: 'uses_output',
                  extractedPhrase: ref,
                });
                dependencyCount++;
              }
            }
          } else {
            // Text-based reference
            const referencedNode = nodeTitleIndex.find(n =>
              sourceText.toLowerCase().includes(n.title) ||
              n.title.includes(sourceText.toLowerCase().split(' ')[0])
            );

            if (referencedNode && referencedNode.id !== node.nodeId) {
              const fullNode = nodes.find(n => n.nodeId === referencedNode.id);
              if (fullNode) {
                const exists = node.dependencies.some(d =>
                  d.referencedNodeTitle === fullNode.title
                );

                if (!exists) {
                  node.dependencies.push({
                    referencedNodeTitle: fullNode.title,
                    dependencyType: 'uses_output',
                    extractedPhrase: ref,
                  });
                  dependencyCount++;
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`[DEPENDENCY_EXTRACTOR] Extracted ${dependencyCount} dependencies`);
}

