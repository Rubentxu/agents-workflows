/**
 * Global Teardown - Runs after all tests
 * 
 * Responsibilities:
 * 1. Archive test artifacts (always preserved per decision)
 * 2. Cleanup test workspace if needed
 * 3. Generate test report summary
 */

import { FullConfig } from '@playwright/test';

const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID;

async function globalTeardown(config: FullConfig) {
  console.log('\n=== Global Teardown ===');
  
  // 1. Report workspace used for this session
  if (WORKSPACE_ID) {
    console.log(`✓ Test workspace preserved: ${WORKSPACE_ID}`);
    console.log(`  Artifacts available at: ~/.workflows/workspaces/${WORKSPACE_ID}/`);
  }
  
  // 2. Generate summary (could enhance with test stats)
  console.log('✓ Test artifacts preserved in: ./test-results/');
  console.log('✓ HTML report available at: ./playwright-report/');
  console.log('  Run: npx playwright show-report');
  
  console.log('=== Global Teardown Complete ===');
}

export default globalTeardown;
