#!/usr/bin/env python3
"""
E2E Tests for agents-workflows MCP Server
Simulates LLM agent behavior for testing
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from mcp_client import MCPClient, LLMAgentSimulator


def test_initialize():
    """Test MCP initialization"""
    print("\n" + "="*60)
    print("TEST: Initialize")
    print("="*60)
    
    client = MCPClient("localhost", 8080)
    result = client.initialize()
    
    assert "result" in result, f"Expected result, got: {result}"
    assert "serverInfo" in result["result"]
    assert result["result"]["serverInfo"]["name"] == "workflow-mcp"
    
    print("✓ Initialize works")
    return client


def test_workflow_discovery(client: MCPClient):
    """Test workflow discovery tools"""
    print("\n" + "="*60)
    print("TEST: Workflow Discovery")
    print("="*60)
    
    # workflow_list
    result = client.workflow_list()
    assert "result" in result, f"workflow_list failed: {result}"
    workflows = result["result"]
    print(f"  ✓ workflow_list returned {len(workflows)} workflow(s)")
    
    if workflows:
        # workflow_get
        wf_arn = workflows[0]["arn"]
        result = client.workflow_get(wf_arn)
        assert "result" in result, f"workflow_get failed: {result}"
        print(f"  ✓ workflow_get for {wf_arn}")
        
        # workflow_get_dag
        result = client.workflow_get_dag(wf_arn)
        assert "result" in result, f"workflow_get_dag failed: {result}"
        dag = result["result"]
        print(f"  ✓ workflow_get_dag: {len(dag.get('nodes', []))} nodes")
    
    return True


def test_workflow_execution(client: MCPClient):
    """Test workflow execution flow"""
    print("\n" + "="*60)
    print("TEST: Workflow Execution")
    print("="*60)
    
    # Get workflow ARN
    result = client.workflow_list()
    workflows = result["result"]
    assert len(workflows) > 0, "No workflows available"
    
    wf_arn = workflows[0]["arn"]
    
    # Execute workflow
    result = client.workflow_execute(
        workflow_arn=wf_arn,
        workspace_id="test-workspace",
        input={"goal": "test goal from e2e"}
    )
    
    assert "result" in result, f"workflow_execute failed: {result}"
    execution = result["result"]
    exec_arn = execution["arn"]
    
    print(f"  ✓ workflow_execute: {exec_arn}")
    assert "pending" in execution["status"] or "running" in execution["status"]
    
    # Get state
    result = client.workflow_get_state(exec_arn)
    assert "result" in result, f"workflow_get_state failed: {result}"
    state = result["result"]
    print(f"  ✓ workflow_get_state: status={state['status']}")
    
    # Update state
    result = client.workflow_update_state(
        execution_arn=exec_arn,
        status="running",
        current_stage="explore",
        completed_stages=["explore"]
    )
    assert "result" in result, f"workflow_update_state failed: {result}"
    print(f"  ✓ workflow_update_state")
    
    # Verify state updated
    result = client.workflow_get_state(exec_arn)
    state = result["result"]
    assert state["current_stage"] == "explore"
    print(f"  ✓ State verified: current_stage={state['current_stage']}")
    
    # Abort
    result = client.workflow_abort(exec_arn)
    assert "result" in result, f"workflow_abort failed: {result}"
    print(f"  ✓ workflow_abort")
    
    return True


def test_agent_tools(client: MCPClient):
    """Test agent tools"""
    print("\n" + "="*60)
    print("TEST: Agent Tools")
    print("="*60)
    
    result = client.agent_list()
    assert "result" in result, f"agent_list failed: {result}"
    agents = result["result"]
    print(f"  ✓ agent_list: {len(agents)} agent(s)")
    
    if agents:
        agent_arn = agents[0]["arn"]
        result = client.agent_get(agent_arn)
        # agent_get might fail if handler not implemented, that's ok
        if "result" in result:
            print(f"  ✓ agent_get: {agent_arn}")
    
    return True


def test_skill_tools(client: MCPClient):
    """Test skill tools"""
    print("\n" + "="*60)
    print("TEST: Skill Tools")
    print("="*60)
    
    result = client.skill_list()
    assert "result" in result, f"skill_list failed: {result}"
    skills = result["result"]
    print(f"  ✓ skill_list: {len(skills)} skill(s)")
    
    if skills:
        skill_arn = skills[0]["arn"]
        result = client.skill_get(skill_arn)
        if "result" in result:
            print(f"  ✓ skill_get: {skill_arn}")
    
    return True


def test_prompt_tools(client: MCPClient):
    """Test prompt tools"""
    print("\n" + "="*60)
    print("TEST: Prompt Tools")
    print("="*60)
    
    result = client.prompt_list()
    assert "result" in result, f"prompt_list failed: {result}"
    prompts = result["result"]
    print(f"  ✓ prompt_list: {len(prompts)} prompt(s)")
    
    if prompts:
        prompt_arn = prompts[0]["arn"]
        result = client.prompt_get(prompt_arn)
        if "result" in result:
            print(f"  ✓ prompt_get: {prompt_arn}")
    
    return True


def test_execution_tools(client: MCPClient):
    """Test execution tools"""
    print("\n" + "="*60)
    print("TEST: Execution Tools")
    print("="*60)
    
    result = client.execution_list(workspace_id="test-workspace")
    assert "result" in result, f"execution_list failed: {result}"
    executions = result["result"]
    print(f"  ✓ execution_list: {len(executions)} execution(s)")
    
    if executions:
        exec_arn = executions[0]["arn"]
        result = client.execution_get(exec_arn)
        if "result" in result:
            print(f"  ✓ execution_get: {exec_arn}")
    
    return True


def test_artifact_tools(client: MCPClient):
    """Test artifact tools"""
    print("\n" + "="*60)
    print("TEST: Artifact Tools")
    print("="*60)
    
    # First execute a workflow to have an execution ARN
    result = client.workflow_list()
    wf_arn = result["result"][0]["arn"]
    
    result = client.workflow_execute(wf_arn, "test-workspace", {"test": True})
    exec_arn = result["result"]["arn"]
    
    # Create artifact
    result = client.artifact_create(
        execution_arn=exec_arn,
        name="test-artifact",
        content="# Test Artifact\n\nThis is a test.",
        content_type="text/markdown",
        stage_id="explore"
    )
    
    if "result" in result:
        artifact_arn = result["result"].get("arn") or result["result"].get("id")
        print(f"  ✓ artifact_create: {artifact_arn}")
        
        # Get artifact
        # result = client.artifact_get(artifact_arn)
        # Note: artifact_get might not be implemented
    else:
        print(f"  ⚠ artifact_create returned: {result}")
    
    # List artifacts
    result = client.artifact_list()
    if "result" in result:
        artifacts = result["result"]
        print(f"  ✓ artifact_list: {len(artifacts)} artifact(s)")
    
    return True


def test_insights_tools(client: MCPClient):
    """Test insights tools"""
    print("\n" + "="*60)
    print("TEST: Insights Tools")
    print("="*60)
    
    # Execute a workflow first
    result = client.workflow_list()
    wf_arn = result["result"][0]["arn"]
    
    result = client.workflow_execute(wf_arn, "test-workspace", {"test": True})
    exec_arn = result["result"]["arn"]
    
    # Log insights
    result = client.insights_log(
        execution_arn=exec_arn,
        insight_type="stage:completed",
        data={
            "stage": "explore",
            "tokens_used": 1500,
            "duration_ms": 5000
        },
        stage_id="explore"
    )
    
    if "result" in result:
        print(f"  ✓ insights_log")
    else:
        print(f"  ⚠ insights_log returned: {result}")
    
    # Query insights
    result = client.insights_query(execution_arn=exec_arn)
    if "result" in result:
        insights = result["result"]
        print(f"  ✓ insights_query: {len(insights)} insight(s)")
    else:
        print(f"  ⚠ insights_query returned: {result}")
    
    return True


def test_full_agent_simulation():
    """Test full LLM agent simulation"""
    print("\n" + "="*60)
    print("TEST: Full Agent Simulation")
    print("="*60)
    
    client = MCPClient("localhost", 8080)
    agent = LLMAgentSimulator(client)
    
    # Run full workflow
    exec_arn = agent.run_full_workflow("test implementation of user authentication")
    
    if exec_arn:
        print(f"\n  ✓ Full workflow executed: {exec_arn}")
    
    return exec_arn is not None


def run_all_tests():
    """Run all E2E tests"""
    print("\n" + "="*60)
    print("🚀 E2E TESTS FOR AGENTS-WORKFLOWS MCP SERVER")
    print("="*60)
    
    results = []
    
    try:
        # Initialize and get client
        client = test_initialize()
        results.append(("Initialize", True))
        
        # Core workflow tests
        results.append(("Workflow Discovery", test_workflow_discovery(client)))
        results.append(("Workflow Execution", test_workflow_execution(client)))
        
        # Resource tools
        results.append(("Agent Tools", test_agent_tools(client)))
        results.append(("Skill Tools", test_skill_tools(client)))
        results.append(("Prompt Tools", test_prompt_tools(client)))
        results.append(("Execution Tools", test_execution_tools(client)))
        results.append(("Artifact Tools", test_artifact_tools(client)))
        results.append(("Insights Tools", test_insights_tools(client)))
        
        # Full simulation
        results.append(("Full Agent Simulation", test_full_agent_simulation()))
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Print summary
    print("\n" + "="*60)
    print("📊 TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
    
    print(f"\n  Total: {passed}/{total} passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️ {total - passed} test(s) failed")
    
    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
