/**
 * ARN (Amazon Resource Name) representation
 * Format: type:arn://registry/namespace/name
 */
export interface Arn {
  type: 'workflow' | 'agent' | 'skill' | 'tool';
  registry: string;
  namespace: string;
  name: string;
}

export function parseArn(arnString: string): Arn | null {
  const match = arnString.match(/^(\w+):arn:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  return {
    type: match[1] as Arn['type'],
    registry: match[2],
    namespace: match[3],
    name: match[4],
  };
}

export function formatArn(type: Arn['type'], registry: string, namespace: string, name: string): string {
  return `${type}:arn://${registry}/${namespace}/${name}`;
}
