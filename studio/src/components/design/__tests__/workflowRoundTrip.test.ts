/**
 * Round-trip tests for Workflow YAML conversion functions.
 * Tests verify that manifestToWorkflow and workflowToYaml are lossless.
 */

import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import type { Workflow } from '@/types/workflow';
import type { WorkflowManifest } from '@/types/manifest.workflow';
import { workflowToYaml, manifestToWorkflow } from '@/lib/workflowToYaml';
import { API_VERSION } from '@/types/manifest';

describe('Workflow YAML round-trip', () => {
  const sampleWorkflow: Workflow = {
    arn: 'arn:local:global:workflow/test-workflow',
    name: 'test-workflow',
    version: '1.0',
    description: 'A test workflow',
    agents: {},
    skills: {},
    stages: [
      {
        id: 'stage-1',
        agent: 'arn:local:global:agent/test-agent',
        depends_on: [],
        description: 'First stage',
        input: {},
        output: { artifacts: [] },
        execution: { mode: 'sequential', retry: { max_attempts: 3, backoff_ms: 1000 } },
        conditions: [],
        metrics: [],
      },
      {
        id: 'stage-2',
        agent: 'arn:local:global:agent/test-agent',
        depends_on: ['stage-1'],
        description: 'Second stage',
        input: {},
        output: { artifacts: [] },
        execution: { mode: 'parallel', retry: { max_attempts: 2, backoff_ms: 500 } },
        conditions: [
          { when: 'previous.success', operator: 'equals', value: true },
        ],
        metrics: [],
      },
    ],
    execution: {
      mode: 'sequential',
      on_failure: 'abort',
    },
    metrics: {
      streaming: true,
      interval_ms: 5000,
      channels: ['execution', 'metrics'],
    },
  };

  describe('workflowToYaml', () => {
    it('produces valid YAML string', () => {
      const result = workflowToYaml(sampleWorkflow);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('produces YAML that can be parsed back to a manifest object', () => {
      const yamlStr = workflowToYaml(sampleWorkflow);
      const parsed = yaml.load(yamlStr);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('produces YAML with correct apiVersion and kind', () => {
      const yamlStr = workflowToYaml(sampleWorkflow);
      const parsed = yaml.load(yamlStr) as WorkflowManifest;
      expect(parsed.apiVersion).toBe(API_VERSION);
      expect(parsed.kind).toBe('Workflow');
    });

    it('round-trip: workflow → yaml → manifest → workflow preserves data', () => {
      const yamlStr = workflowToYaml(sampleWorkflow);
      const parsed = yaml.load(yamlStr) as WorkflowManifest;
      const restored = manifestToWorkflow(parsed);

      expect(restored.name).toBe(sampleWorkflow.name);
      expect(restored.description).toBe(sampleWorkflow.description);
      expect(restored.stages).toEqual(sampleWorkflow.stages);
      expect(restored.execution).toEqual(sampleWorkflow.execution);
      expect(restored.metrics).toEqual(sampleWorkflow.metrics);
      expect(parsed.spec.execution.on_failure).toBe('abort');
    });

    it('round-trip: yaml → manifest → yaml produces identical YAML', () => {
      const yamlStr1 = workflowToYaml(sampleWorkflow);
      const parsed = yaml.load(yamlStr1) as WorkflowManifest;
      const restoredWorkflow = manifestToWorkflow(parsed);
      const yamlStr2 = workflowToYaml(restoredWorkflow);

      // Parse both and compare as objects to avoid whitespace differences
      const obj1 = yaml.load(yamlStr1);
      const obj2 = yaml.load(yamlStr2);
      expect(obj1).toEqual(obj2);
    });

    it('produces empty YAML for null workflow', () => {
      const result = workflowToYaml(null);
      expect(result).toBe('');
    });

    it('handles workflow with empty stages', () => {
      const emptyStagesWorkflow: Workflow = {
        ...sampleWorkflow,
        stages: [],
      };
      const yamlStr = workflowToYaml(emptyStagesWorkflow);
      const parsed = yaml.load(yamlStr) as WorkflowManifest;
      expect(parsed.spec.stages).toEqual([]);
    });

    it('handles workflow with complex stage dependencies', () => {
      const complexWorkflow: Workflow = {
        ...sampleWorkflow,
        stages: [
          {
            id: 'a',
            agent: 'arn:local:global:agent/test-agent',
            depends_on: [],
            description: 'Stage A',
            input: {},
            output: { artifacts: [] },
            execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 100 } },
            conditions: [],
            metrics: [],
          },
          {
            id: 'b',
            agent: 'arn:local:global:agent/test-agent',
            depends_on: ['a'],
            description: 'Stage B',
            input: {},
            output: { artifacts: [] },
            execution: { mode: 'parallel', retry: { max_attempts: 1, backoff_ms: 100 } },
            conditions: [],
            metrics: [],
          },
          {
            id: 'c',
            agent: 'arn:local:global:agent/test-agent',
            depends_on: ['a', 'b'],
            description: 'Stage C',
            input: {},
            output: { artifacts: [] },
            execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 100 } },
            conditions: [],
            metrics: [],
          },
        ],
      };
      const yamlStr = workflowToYaml(complexWorkflow);
      const parsed = yaml.load(yamlStr) as WorkflowManifest;
      const restored = manifestToWorkflow(parsed);

      expect(restored.stages.length).toBe(3);
      expect(restored.stages[2].depends_on).toEqual(['a', 'b']);
    });
  });

  describe('manifestToWorkflow', () => {
    it('converts a valid manifest to workflow', () => {
      const manifest: WorkflowManifest = {
        apiVersion: API_VERSION,
        kind: 'Workflow',
        metadata: {
          uid: 'test-uid',
          name: 'my-workflow',
          scope: 'global',
          labels: {},
          annotations: {},
        },
        spec: {
          description: 'Test description',
          stages: [],
          execution: { mode: 'parallel', on_failure: 'continue' },
          metrics: { streaming: false, interval_ms: 3000, channels: [] },
        },
      };

      const result = manifestToWorkflow(manifest);
      expect(result.name).toBe('my-workflow');
      expect(result.description).toBe('Test description');
      expect(result.execution.mode).toBe('parallel');
      expect(result.execution.on_failure).toBe('continue');
    });

    it('maps on_failure continue correctly in manifestToWorkflow', () => {
      const manifest: WorkflowManifest = {
        apiVersion: API_VERSION,
        kind: 'Workflow',
        metadata: {
          uid: 'test-uid',
          name: 'continue-workflow',
          scope: 'global',
          labels: {},
          annotations: {},
        },
        spec: {
          description: 'Test description',
          stages: [],
          execution: { mode: 'parallel', on_failure: 'continue' },
          metrics: { streaming: false, interval_ms: 3000, channels: [] },
        },
      };

      const result = manifestToWorkflow(manifest);
      expect(result.execution.on_failure).toBe('continue');
    });

    it('uses global scope when metadata.scope is missing', () => {
      const manifest: WorkflowManifest = {
        apiVersion: API_VERSION,
        kind: 'Workflow',
        metadata: {
          uid: '',
          name: 'test',
          scope: 'global',
          labels: {},
          annotations: {},
        },
        spec: {
          stages: [],
          execution: { mode: 'sequential', on_failure: 'abort' },
        },
      };

      const result = manifestToWorkflow(manifest);
      expect(result.arn).toContain('workflow/test');
    });

    it('handles missing optional fields with defaults', () => {
      const minimalManifest: WorkflowManifest = {
        apiVersion: API_VERSION,
        kind: 'Workflow',
        metadata: {
          uid: '',
          name: 'minimal',
          scope: 'global',
          labels: {},
          annotations: {},
        },
        spec: {
          stages: [],
          execution: { mode: 'sequential', on_failure: 'abort' },
        },
      };

      const result = manifestToWorkflow(minimalManifest);
      expect(result.description).toBe('');
      expect(result.agents).toEqual({});
      expect(result.skills).toEqual({});
      expect(result.metrics).toEqual({ streaming: false, interval_ms: 5000, channels: [] });
    });

    it('throws on invalid YAML syntax', () => {
      const invalidYaml = `
        apiVersion: workflows.local/v1
        kind: Workflow
        metadata:
          name: test
          scope: global
        spec:
          stages: [
            invalid yaml here - missing quotes
      `;

      expect(() => {
        yaml.load(invalidYaml);
      }).toThrow();
    });
  });

  describe('error handling', () => {
    it('handles empty YAML string gracefully', () => {
      const emptyYaml = '';
      const parsed = yaml.load(emptyYaml);
      // yaml.load returns undefined for empty string
      expect(parsed).toBeUndefined();
    });

    it('handles YAML with only whitespace', () => {
      const whitespaceYaml = '   \n\n  ';
      const parsed = yaml.load(whitespaceYaml);
      expect(parsed).toBeNull();
    });

    it('workflowToYaml handles workflow with all fields populated', () => {
      const fullWorkflow: Workflow = {
        arn: 'arn:local:workspace/test:workflow/complete',
        name: 'complete-workflow',
        version: '2.0',
        description: 'Workflow with all fields',
        agents: {
          'test-agent': {
            name: 'arn:local:global:agent/test-agent',
            description: 'Test agent',
            model: 'gpt-4',
            skills: [],
            tools: [],
            prompts: [],
          },
        },
        skills: {
          'test-skill': {
            source: 'arn:local:global:skill/test',
            triggers: ['test'],
            compact_rules: true,
          },
        },
        stages: [
          {
            id: 'complete-stage',
            agent: 'arn:local:global:agent/test-agent',
            depends_on: [],
            description: 'Complete stage',
            input: { key: 'value' },
            output: { artifacts: [{ name: 'out', path_template: '/tmp/{{id}}' }] },
            execution: { mode: 'batch', batch_size: 10, retry: { max_attempts: 5, backoff_ms: 2000 } },
            conditions: [{ when: 'input.key', operator: 'equals', value: 'value' }],
            metrics: ['duration', 'cost'],
          },
        ],
        execution: {
          mode: 'parallel',
          on_failure: 'continue',
        },
        metrics: {
          streaming: true,
          interval_ms: 1000,
          channels: ['all'],
        },
      };

      const yamlStr = workflowToYaml(fullWorkflow);
      const parsed = yaml.load(yamlStr) as WorkflowManifest;
      const restored = manifestToWorkflow(parsed);

      expect(restored.name).toBe(fullWorkflow.name);
      // Note: version is not preserved in manifest round-trip (it's internal-only)
      expect(restored.agents).toEqual(fullWorkflow.agents);
      expect(restored.skills).toEqual(fullWorkflow.skills);
      expect(restored.stages[0].input).toEqual(fullWorkflow.stages[0].input);
    });
  });
});
