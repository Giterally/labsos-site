'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, ArrowRight } from 'lucide-react';

interface Proposal {
  id: string;
  node_json: {
    title: string;
    dependencies?: Array<{
      referenced_title?: string;
      referencedNodeTitle?: string;
      dependency_type?: string;
      dependencyType?: string;
      extractedPhrase?: string;
    }>;
  };
}

interface DependencyGraphProps {
  proposals: Proposal[];
}

const DEPENDENCY_COLORS: Record<string, string> = {
  requires: 'text-blue-600 border-blue-300 bg-blue-50',
  uses_output: 'text-green-600 border-green-300 bg-green-50',
  follows: 'text-purple-600 border-purple-300 bg-purple-50',
  validates: 'text-orange-600 border-orange-300 bg-orange-50',
};

const DEPENDENCY_LABELS: Record<string, string> = {
  requires: 'Requires',
  uses_output: 'Uses Output',
  follows: 'Follows',
  validates: 'Validates',
};

export default function DependencyGraph({ proposals }: DependencyGraphProps) {
  const dependencyMap = useMemo(() => {
    const map = new Map<string, Array<{ target: string; type: string; phrase?: string }>>();
    const proposalTitleMap = new Map<string, string>();

    // Build title to ID map
    proposals.forEach(p => {
      proposalTitleMap.set(p.node_json.title.toLowerCase(), p.id);
    });

    // Build dependency graph
    proposals.forEach(proposal => {
      const deps = proposal.node_json.dependencies || [];
      if (deps.length === 0) return;

      const proposalDeps: Array<{ target: string; type: string; phrase?: string }> = [];

      deps.forEach(dep => {
        const targetTitle = dep.referencedNodeTitle || dep.referenced_title;
        if (!targetTitle) return;

        const targetId = proposalTitleMap.get(targetTitle.toLowerCase());
        if (targetId && targetId !== proposal.id) {
          proposalDeps.push({
            target: targetId,
            type: dep.dependencyType || dep.dependency_type || 'requires',
            phrase: dep.extractedPhrase,
          });
        }
      });

      if (proposalDeps.length > 0) {
        map.set(proposal.id, proposalDeps);
      }
    });

    return map;
  }, [proposals]);

  const nodesWithDeps = Array.from(dependencyMap.keys());
  const totalDependencies = Array.from(dependencyMap.values()).reduce((sum, deps) => sum + deps.length, 0);

  if (totalDependencies === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4" />
            Dependency Graph
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No dependencies detected between proposals yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4" />
          Dependency Graph
          <Badge variant="secondary" className="ml-2">
            {totalDependencies} {totalDependencies === 1 ? 'dependency' : 'dependencies'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {nodesWithDeps.map(proposalId => {
            const proposal = proposals.find(p => p.id === proposalId);
            if (!proposal) return null;

            const deps = dependencyMap.get(proposalId) || [];

            return (
              <div key={proposalId} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium text-sm">{proposal.node_json.title}</div>
                <div className="space-y-1.5">
                  {deps.map((dep, idx) => {
                    const targetProposal = proposals.find(p => p.id === dep.target);
                    if (!targetProposal) return null;

                    const depType = dep.type || 'requires';
                    const colorClass = DEPENDENCY_COLORS[depType] || DEPENDENCY_COLORS.requires;
                    const label = DEPENDENCY_LABELS[depType] || depType;

                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className={`text-xs ${colorClass}`}>
                          {label}
                        </Badge>
                        <span className="text-muted-foreground flex-1 truncate">
                          {targetProposal.node_json.title}
                        </span>
                        {dep.phrase && (
                          <span className="text-xs text-muted-foreground italic ml-2 truncate max-w-xs">
                            "{dep.phrase}"
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}



