#!/usr/bin/env python3
"""
MCP Client for testing - simulates LLM agent behavior
"""

import http.client
import json
import time
from typing import Any, Optional


class MCPClient:
    """MCP client that handles session and connection properly"""
    
    def __init__(self, host: str = "localhost", port: int = 8080):
        self.host = host
        self.port = port
        self.session_id: Optional[str] = None
        self.protocol_version = "2024-11-05"
    
    def _request(self, method: str, params: dict = None, id: int = 1) -> dict:
        """Send a request and return the parsed response"""
        payload = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": id
        })
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        conn.request("POST", "/mcp", body=payload, headers=headers)
        resp = conn.getresponse()
        
        # Update session ID if provided
        new_session = resp.getheader("Mcp-Session-Id")
        if new_session:
            self.session_id = new_session
        
        body = resp.read().decode()
        conn.close()
        
        # Parse SSE response
        for line in body.split("\n"):
            line = line.strip()
            if line.startswith("data:"):
                data = line[5:].strip()
                if data:
                    try:
                        return json.loads(data)
                    except json.JSONDecodeError:
                        pass
        
        return {"error": {"code": -32000, "message": "No response"}}
    
    def initialize(self) -> dict:
        """Initialize the MCP session (like an LLM agent connecting)"""
        response = self._request("initialize", {
            "protocolVersion": self.protocol_version,
            "capabilities": {},
            "clientInfo": {"name": "test-agent", "version": "1.0"}
        }, id=0)
        
        if "result" in response:
            print(f"  ✓ Initialized: {response['result']['serverInfo']['name']} v{response['result']['serverInfo']['version']}")
        
        return response
    
    # ===================================================================
    # Workflow Tools (simulating LLM agent workflow discovery and execution)
    # ===================================================================
    
    def workflow_list(self, scope: str = None) -> dict:
        """List available workflows"""
        params = {}
        if scope:
            params["scope"] = scope
        return self._request("workflow_list", params)
    
    def workflow_get(self, arn: str) -> dict:
        """Get workflow details"""
        return self._request("workflow_get", {"arn": arn})
    
    def workflow_get_dag(self, arn: str) -> dict:
        """Get workflow DAG (stages and dependencies)"""
        return self._request("workflow_get_dag", {"arn": arn})
    
    def workflow_execute(self, workflow_arn: str, workspace_id: str = "default", input: dict = None) -> dict:
        """Start a workflow execution (simulates LLM deciding to run a workflow)"""
        return self._request("workflow_execute", {
            "workflow_arn": workflow_arn,
            "workspace_id": workspace_id,
            "input": input or {}
        })
    
    def workflow_get_state(self, execution_arn: str) -> dict:
        """Get current execution state"""
        return self._request("workflow_get_state", {"execution_arn": execution_arn})
    
    def workflow_update_state(self, execution_arn: str, **kwargs) -> dict:
        """Update execution state (simulates LLM updating progress)"""
        params = {"execution_arn": execution_arn}
        params.update(kwargs)
        return self._request("workflow_update_state", params)
    
    def workflow_abort(self, execution_arn: str) -> dict:
        """Abort a running execution"""
        return self._request("workflow_abort", {"execution_arn": execution_arn})
    
    # ===================================================================
    # Agent Tools
    # ===================================================================
    
    def agent_list(self, scope: str = None) -> dict:
        """List available agents"""
        params = {}
        if scope:
            params["scope"] = scope
        return self._request("agent_list", params)
    
    def agent_get(self, arn: str) -> dict:
        """Get agent details"""
        return self._request("agent_get", {"arn": arn})
    
    # ===================================================================
    # Skill Tools
    # ===================================================================
    
    def skill_list(self, scope: str = None) -> dict:
        """List available skills"""
        params = {}
        if scope:
            params["scope"] = scope
        return self._request("skill_list", params)
    
    def skill_get(self, arn: str) -> dict:
        """Get skill content"""
        return self._request("skill_get", {"arn": arn})
    
    # ===================================================================
    # Prompt Tools
    # ===================================================================
    
    def prompt_list(self, scope: str = None) -> dict:
        """List available prompts"""
        params = {}
        if scope:
            params["scope"] = scope
        return self._request("prompt_list", params)
    
    def prompt_get(self, arn: str) -> dict:
        """Get prompt content"""
        return self._request("prompt_get", {"arn": arn})
    
    # ===================================================================
    # Execution Tools
    # ===================================================================
    
    def execution_list(self, workspace_id: str = None) -> dict:
        """List executions"""
        params = {}
        if workspace_id:
            params["workspace_id"] = workspace_id
        return self._request("execution_list", params)
    
    def execution_get(self, arn: str) -> dict:
        """Get execution details"""
        return self._request("execution_get", {"arn": arn})
    
    # ===================================================================
    # Artifact Tools
    # ===================================================================
    
    def artifact_create(self, execution_arn: str, name: str, content: str, content_type: str = "text/plain", stage_id: str = None) -> dict:
        """Create an artifact"""
        params = {
            "execution_arn": execution_arn,
            "name": name,
            "content": content,
            "content_type": content_type
        }
        if stage_id:
            params["stage_id"] = stage_id
        return self._request("artifact_create", params)
    
    def artifact_get(self, arn: str) -> dict:
        """Get artifact"""
        return self._request("artifact_get", {"arn": arn})
    
    def artifact_list(self) -> dict:
        """List artifacts"""
        return self._request("artifact_list")
    
    # ===================================================================
    # Insights Tools
    # ===================================================================
    
    def insights_log(self, execution_arn: str, insight_type: str, data: dict, stage_id: str = None) -> dict:
        """Log an insight event"""
        params = {
            "execution_arn": execution_arn,
            "insight_type": insight_type,
            "data": data
        }
        if stage_id:
            params["stage_id"] = stage_id
        return self._request("insights_log", params)
    
    def insights_query(self, execution_arn: str = None, insight_type: str = None) -> dict:
        """Query insights"""
        params = {}
        if execution_arn:
            params["execution_arn"] = execution_arn
        if insight_type:
            params["insight_type"] = insight_type
        return self._request("insights_query", params)
    
    # ===================================================================
    # Metrics Tools
    # ===================================================================
    
    def metrics_query(self, execution_arn: str) -> dict:
        """Query metrics"""
        return self._request("metrics_query", {"execution_arn": execution_arn})
    
    def metrics_subscribe(self, execution_arn: str) -> dict:
        """Get SSE URL for metrics subscription"""
        return self._request("metrics_subscribe", {"execution_arn": execution_arn})


class LLMAgentSimulator:
    """
    Simulates an LLM agent using the MCP server.
    This is what OpenCode/Claude Code agents would do.
    """
    
    def __init__(self, mcp_client: MCPClient):
        self.mcp = mcp_client
        self.execution_arn: str = None
        self.workflow_arn: str = None
    
    def initialize(self):
        """Agent initialization"""
        print("\n" + "="*60)
        print("🤖 LLM Agent Initializing...")
        print("="*60)
        self.mcp.initialize()
    
    def discover_available_workflows(self):
        """Simulates agent discovering workflows to choose from"""
        print("\n" + "-"*60)
        print("🔍 Agent discovering available workflows...")
        print("-"*60)
        
        result = self.mcp.workflow_list()
        if "result" in result:
            workflows = result["result"]
            print(f"  Found {len(workflows)} workflow(s):")
            for wf in workflows:
                print(f"    - {wf['arn']}: {wf['name']}")
                if wf.get('description'):
                    print(f"      {wf['description']}")
            return workflows
        else:
            print(f"  ✗ Error: {result.get('error')}")
            return []
    
    def select_and_execute_workflow(self, goal: str):
        """Simulates agent selecting a workflow and executing it"""
        print("\n" + "-"*60)
        print(f"🎯 Agent selecting workflow for goal: '{goal}'")
        print("-"*60)
        
        # Get the first workflow (in real life, agent would choose based on goal)
        workflows = self.discover_available_workflows()
        if not workflows:
            return None
        
        self.workflow_arn = workflows[0]["arn"]
        print(f"\n  Selected: {self.workflow_arn}")
        
        # Get DAG to understand stages
        dag_result = self.mcp.workflow_get_dag(self.workflow_arn)
        if "result" in dag_result:
            dag = dag_result["result"]
            print(f"  Stages: {len(dag.get('nodes', []))}")
            for group_idx, group in enumerate(dag.get("parallel_groups", [])):
                print(f"    Group {group_idx+1}: {group}")
        
        # Execute workflow
        print(f"\n  ⚡ Executing workflow...")
        exec_result = self.mcp.workflow_execute(
            workflow_arn=self.workflow_arn,
            workspace_id="default",
            input={"goal": goal}
        )
        
        if "result" in exec_result:
            self.execution_arn = exec_result["result"]["arn"]
            print(f"  ✓ Execution started: {self.execution_arn}")
            print(f"  Status: {exec_result['result']['status']}")
            return self.execution_arn
        else:
            print(f"  ✗ Error: {exec_result.get('error')}")
            return None
    
    def report_progress(self, stage_id: str, stage_name: str, data: dict):
        """Simulates agent reporting progress"""
        if not self.execution_arn:
            return
        
        print(f"\n  📝 Reporting progress for stage '{stage_name}'...")
        
        # Update state
        update_result = self.mcp.workflow_update_state(
            execution_arn=self.execution_arn,
            status="running",
            current_stage=stage_id,
            completed_stages=[stage_id]
        )
        
        # Log insight
        insight_result = self.mcp.insights_log(
            execution_arn=self.execution_arn,
            insight_type="stage:completed",
            data=data,
            stage_id=stage_id
        )
        
        if "result" in update_result and "result" in insight_result:
            print(f"  ✓ Progress reported")
    
    def complete_workflow(self):
        """Simulates agent completing workflow"""
        if not self.execution_arn:
            return
        
        print("\n" + "-"*60)
        print("✅ Agent completing workflow...")
        print("-"*60)
        
        # Update final state
        result = self.mcp.workflow_update_state(
            execution_arn=self.execution_arn,
            status="completed"
        )
        
        if "result" in result:
            print(f"  ✓ Workflow completed")
            print(f"  Final status: {result['result']['status']}")
    
    def run_full_workflow(self, goal: str):
        """Run a complete workflow simulation"""
        self.initialize()
        
        # Step 1: Discover
        if not self.discover_available_workflows():
            return
        
        # Step 2: Execute
        exec_arn = self.select_and_execute_workflow(goal)
        if not exec_arn:
            return
        
        # Step 3: Simulate stages
        print("\n" + "-"*60)
        print("🔄 Simulating workflow stages...")
        print("-"*60)
        
        stages = ["explore", "propose", "spec", "design", "tasks", "apply", "verify", "archive"]
        
        for stage in stages:
            print(f"\n  Stage: {stage}")
            
            # Simulate stage work
            stage_data = {
                "stage": stage,
                "input_tokens": 1000,
                "output_tokens": 500,
                "duration_ms": 1000
            }
            
            # Report progress
            self.report_progress(stage, stage, stage_data)
            
            # Small delay to simulate work
            time.sleep(0.1)
        
        # Step 4: Complete
        self.complete_workflow()
        
        return self.execution_arn


if __name__ == "__main__":
    print("MCP E2E Test Client")
    print("="*60)
    
    client = MCPClient("localhost", 8080)
    client.initialize()
    
    print("\n✅ MCP connection working!")
