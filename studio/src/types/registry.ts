/**
 * Node types in the registry
 */
export type NodeType = 'workflow' | 'agent' | 'skill' | 'tool' | 'prompt' | 'template' | 'stage' | 'artifact' | 'execution' | 'insight' | 'resource';

/**
 * Node in the registry graph
 */
export interface RegistryNode {
  id: string;  // Full ARN
  type: NodeType;
  name: string;
  registry: string;
  namespace: string;
  path?: string;
  checksum?: string;
  config_json?: string;  // JSON configuration
  metadata_json?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Edge relationship types
 */
export type RelationshipType =
  | 'depends_on'
  | 'uses'
  | 'provides'
  | 'references'
  | 'configures';

/**
 * Edge in the registry graph
 */
export interface RegistryEdge {
  id: number;
  from_id: string;  // Source ARN
  to_id: string;  // Target ARN
  relationship_type: RelationshipType;
  metadata_json?: string;
}

/**
 * Graph representation of the registry
 */
export interface RegistryGraph {
  nodes: RegistryNode[];
  edges: RegistryEdge[];
}
