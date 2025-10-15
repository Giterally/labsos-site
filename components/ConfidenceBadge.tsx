import { Badge } from './ui/badge';

interface ConfidenceBadgeProps {
  confidence: number;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceBadge({ 
  confidence, 
  showPercentage = true, 
  size = 'md' 
}: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  
  let variant: 'default' | 'secondary' | 'destructive' | 'outline';
  let className = '';
  
  if (confidence >= 0.8) {
    variant = 'default';
    className = 'bg-green-100 text-green-800 border-green-200';
  } else if (confidence >= 0.6) {
    variant = 'default';
    className = 'bg-yellow-100 text-yellow-800 border-yellow-200';
  } else {
    variant = 'destructive';
    className = 'bg-red-100 text-red-800 border-red-200';
  }

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1',
  };

  return (
    <Badge 
      variant={variant} 
      className={`${className} ${sizeClasses[size]}`}
    >
      {showPercentage ? `${percentage}%` : getConfidenceLabel(confidence)}
    </Badge>
  );
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.6) return 'Medium';
  return 'Low';
}
